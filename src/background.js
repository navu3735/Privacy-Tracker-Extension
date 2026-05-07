// Background Service Worker
// Matches collected URLs against tracker patterns and stores a compact report

console.log('Privacy Visualizer: background worker loaded');

let trackerDatabase = [];
/** @type {{ pattern: string, id: string }[]} */
let trackerPatterns = [];
let lastAnalysis = null;
let dbLoadPromise = null;

function buildPatternIndex() {
  trackerPatterns = [];
  for (const tracker of trackerDatabase) {
    for (const domain of tracker.domains) {
      trackerPatterns.push({
        pattern: String(domain).toLowerCase(),
        id: tracker.id,
      });
    }
  }
}

async function loadTrackerDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/trackers.json'));
    const data = await response.json();
    trackerDatabase = data.trackers || [];
    buildPatternIndex();
    console.log(
      `Privacy Visualizer: loaded ${trackerDatabase.length} trackers (${trackerPatterns.length} patterns)`
    );
  } catch (error) {
    console.error('Privacy Visualizer: tracker DB error', error);
    trackerDatabase = [];
    trackerPatterns = [];
  }
}

function ensureDatabase() {
  if (!dbLoadPromise) {
    dbLoadPromise = loadTrackerDatabase();
  }
  return dbLoadPromise;
}

const MAX_SCAN_LOG_LINES = 56;

function truncateUrl(s, max = 72) {
  const str = String(s);
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/** First hit per tracker + lines the popup can mirror as “background activity”. */
function findTrackersWithDetails(urlStrings) {
  const found = new Map();
  for (const raw of urlStrings) {
    const item = String(raw).toLowerCase();
    for (const { pattern, id } of trackerPatterns) {
      if (item.includes(pattern) && !found.has(id)) {
        found.set(id, { pattern, sample: truncateUrl(raw) });
      }
    }
  }

  const trackers = [];
  const logLines = [];
  for (const [id, hit] of found) {
    const t = trackerDatabase.find((x) => x.id === id);
    if (!t) continue;
    trackers.push(t);
    logLines.push(
      `▸ ${t.name}: matched “${hit.pattern}” in ${hit.sample}`
    );
  }

  return { trackers, logLines };
}

async function publishScanLive(hostname, status, lines) {
  const trimmed = lines.slice(-MAX_SCAN_LOG_LINES);
  await chrome.storage.local.set({
    scanLive: {
      hostname,
      status,
      lines: trimmed,
      updatedAt: Date.now(),
    },
  });
}

function riskScoreForTrackers(trackers) {
  let score = 0;
  for (const t of trackers) {
    const r = String(t.risk || '').toLowerCase();
    if (r === 'high') score += 2;
    else if (r === 'medium') score += 1;
    else score += 0.5;
  }
  return score;
}

function calculateGrade(trackers, cookieInfo, thirdPartyHostCount, storageFlaggedCount) {
  const riskScore = riskScoreForTrackers(trackers);
  const cookieBump = Math.min(4, (cookieInfo.trackingCookies || []).length * 0.75);
  const hostBump = Math.min(3, Math.floor((thirdPartyHostCount || 0) / 25));
  const storageBump = Math.min(2.25, (storageFlaggedCount || 0) * 0.45);

  const total = riskScore + cookieBump + hostBump + storageBump;

  if (total === 0) return { grade: 'A', text: 'Excellent' };
  if (total <= 2.5) return { grade: 'B', text: 'Good' };
  if (total <= 5) return { grade: 'C', text: 'Fair' };
  if (total <= 8) return { grade: 'D', text: 'Poor' };
  return { grade: 'F', text: 'Bad' };
}

function analyzeStorageKeyNames(names) {
  if (!names || !names.length) return { total: 0, flagged: [] };

  const patterns = [
    'utm_',
    'ga_',
    '_ga',
    'fbp',
    '_fb',
    '_gat',
    '_gid',
    '__hstc',
    '__hssc',
    'intercom',
    'mp_',
    'ajs_',
    '_pin',
    '_ttp',
    '_scid',
    'amplitude',
    'mixpanel',
    'segment',
    'optimizely',
    'hubspot',
    'gtag',
    'analytics',
    'firebase',
    'hotjar',
    'fullstory',
    'logrocket',
    'clarity',
    'heap',
    'plausible',
    'posthog',
    'customerio',
    'braze',
  ];
  const flagged = [];
  for (const k of names) {
    const lower = String(k).toLowerCase();
    if (patterns.some((p) => lower.includes(p))) {
      flagged.push(k);
    }
  }
  return {
    total: names.length,
    flagged: [...new Set(flagged)].slice(0, 40),
  };
}

function analyzeCookies(cookieString) {
  if (!cookieString) return { count: 0, trackingCookies: [] };

  const cookies = cookieString.split(';');
  const trackingPatterns = [
    'utm_',
    'ga_',
    '_ga',
    'fbp',
    '_fb',
    '_gat',
    '_gid',
    '__hstc',
    '__hssc',
    'intercom',
    'mp_',
    'ajs_',
    '_pin',
    '_ttp',
    '_scid',
  ];
  const trackingCookies = [];

  cookies.forEach((cookie) => {
    const trimmed = cookie.trim();
    if (!trimmed) return;
    const hasTracking = trackingPatterns.some((pattern) =>
      trimmed.toLowerCase().includes(pattern)
    );
    if (hasTracking) {
      trackingCookies.push(trimmed.split('=')[0]);
    }
  });

  return {
    count: cookies.filter((c) => c.trim()).length,
    trackingCookies,
  };
}

function getCountries(trackers) {
  const countryMap = {
    'google-analytics': ['USA', 'Europe'],
    'facebook-pixel': ['USA', 'Europe', 'Asia'],
    'google-ads': ['USA', 'Europe'],
    'twitter-analytics': ['USA'],
    linkedin: ['USA', 'Europe'],
    hotjar: ['Europe', 'USA'],
    mixpanel: ['USA'],
    amplitude: ['USA'],
    criteo: ['USA', 'Europe'],
    appnexus: ['USA'],
    segment: ['USA'],
    rubicon: ['USA', 'Europe'],
    openx: ['USA', 'Europe'],
    pubmatic: ['USA', 'Asia'],
    doubleclick: ['USA', 'Europe'],
    'google-doubleclick': ['USA', 'Europe'],
    'tiktok-pixel': ['China', 'USA'],
    'pinterest-analytics': ['USA', 'Europe'],
    'snapchat-pixel': ['USA'],
    'reddit-pixel': ['USA'],
    'amazon-ads': ['USA', 'Europe'],
    'bing-ads': ['USA', 'Europe'],
    floodlight: ['USA', 'Europe'],
    chartbeat: ['USA'],
    comscore: ['USA', 'Europe'],
    quantcast: ['USA', 'Europe'],
    'adobe-analytics': ['USA', 'Europe'],
    matomo: ['Europe'],
    'crazy-egg': ['USA'],
    intercom: ['USA', 'Europe'],
    zendesk: ['USA', 'Europe'],
    drift: ['USA'],
  };

  const countries = new Set();
  trackers.forEach((tracker) => {
    if (!tracker) return;
    const locs = countryMap[tracker.id] || [];
    locs.forEach((loc) => countries.add(loc));
  });

  return Array.from(countries);
}

function slimForStorage(analysis) {
  const {
    url,
    hostname,
    timestamp,
    trackers,
    grade,
    gradeText,
    totalTrackers,
    countries,
    cookies,
    thirdPartyHostCount,
    thirdPartyHosts,
    thirdPartyHostTotal,
    thirdPartyHostsTruncated,
    urlSignalCount,
    scanLog,
    storageScan,
    scopeStats,
  } = analysis;
  return {
    url,
    hostname,
    timestamp,
    trackers,
    grade,
    gradeText,
    totalTrackers,
    countries,
    cookies,
    thirdPartyHostCount,
    thirdPartyHosts: Array.isArray(thirdPartyHosts)
      ? thirdPartyHosts.slice(0, 1000)
      : [],
    thirdPartyHostTotal:
      typeof thirdPartyHostTotal === 'number'
        ? thirdPartyHostTotal
        : (thirdPartyHosts || []).length,
    thirdPartyHostsTruncated: !!thirdPartyHostsTruncated,
    urlSignalCount,
    scanLog: Array.isArray(scanLog) ? scanLog.slice(-24) : [],
    storageScan: storageScan
      ? {
          total: storageScan.total,
          flagged: Array.isArray(storageScan.flagged)
            ? storageScan.flagged.slice(0, 20)
            : [],
        }
      : { total: 0, flagged: [] },
    scopeStats: scopeStats || null,
  };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'analyzePrivacy') {
    (async () => {
      const data = request.data;
      const hostname = data.hostname || '';
      const log = [
        `▸ ${new Date().toLocaleTimeString()} — Background worker starting for ${hostname || 'page'}`,
      ];
      log.push('▸ Loading tracker definitions…');
      await publishScanLive(hostname, 'running', log);

      await ensureDatabase();
      log.push(
        `▸ Tracker DB ready — ${trackerDatabase.length} services, ${trackerPatterns.length} URL patterns`
      );

      const urls = data.urls || [];
      const storageKeyNames = data.storageKeyNames || [];
      const scopeStats = data.scopeStats || {};
      const thirdPartyHosts = Array.isArray(data.thirdPartyHosts)
        ? data.thirdPartyHosts
        : [];
      const thirdPartyHostTotal =
        typeof data.thirdPartyHostTotal === 'number'
          ? data.thirdPartyHostTotal
          : thirdPartyHosts.length;
      const thirdPartyHostsTruncated = !!data.thirdPartyHostsTruncated;
      const thirdPartyHostCount =
        typeof data.thirdPartyHostCount === 'number'
          ? data.thirdPartyHostCount
          : thirdPartyHostTotal;

      const st = scopeStats;
      log.push(
        `▸ Received ${urls.length} URL signals (${thirdPartyHostCount} third-party hosts) + ${storageKeyNames.length} web-storage key names`
      );
      log.push(
        `▸ Scope — scripts ${st.scripts ?? 0} · network ${(st.performanceResources ?? 0) + (st.lateResources ?? 0)} · hints ${st.linkHints ?? 0} · link-assets ${st.linkAssets ?? 0} · embeds/media ${st.embedsMedia ?? 0} · images ${st.images ?? 0} · meta ${st.metaUrls ?? 0} · forms ${st.formActions ?? 0} · link-pings ${st.pingTargets ?? 0} · outbound sample ${st.outboundAnchors ?? 0} · matcher cap ${st.urlCap ?? '?'}`
      );
      log.push('▸ Matching URLs + storage key hints against tracker signatures…');
      await publishScanLive(hostname, 'running', log);

      const augmentedUrls = urls.slice();
      for (const kn of storageKeyNames) {
        augmentedUrls.push(`storage-key|${kn}`);
      }

      const { trackers, logLines } = findTrackersWithDetails(augmentedUrls);
      log.push(...logLines);
      if (trackers.length === 0) {
        log.push('▸ No entries in our list matched these requests (still can be unknown trackers).');
      } else {
        log.push(`▸ Identified ${trackers.length} known tracker${trackers.length === 1 ? '' : 's'} above.`);
        log.push(`▸ Tracker names: ${trackers.map((t) => t.name).join(', ')}`);
      }
      log.push(
        `▸ Third-party hostnames from this scan: ${thirdPartyHostTotal} distinct${thirdPartyHostsTruncated ? ` (list capped at ${thirdPartyHosts.length} for storage)` : ''}`
      );
      await publishScanLive(hostname, 'running', log);

      log.push('▸ Scanning document cookies for common tracking names…');
      const cookies = analyzeCookies(data.cookies);
      log.push(
        `▸ Cookies — ${cookies.count} present, ${cookies.trackingCookies.length} flagged as likely tracking-related`
      );

      const storageScan = analyzeStorageKeyNames(storageKeyNames);
      log.push(
        `▸ Web storage — ${storageScan.total} key names (${storageScan.flagged.length} match common tracking-related patterns)`
      );

      const gradeInfo = calculateGrade(
        trackers,
        cookies,
        thirdPartyHostCount,
        storageScan.flagged.length
      );
      const countries = getCountries(trackers);

      log.push(
        `▸ Grading — trackers + cookies + third-party hosts + storage hints → ${gradeInfo.grade} (${gradeInfo.text})`
      );
      if (countries.length) {
        log.push(`▸ Regional exposure (from our tracker map): ${countries.join(', ')}`);
      }
      log.push('▸ Writing report to extension storage for the popup…');
      log.push('▸ Done — scroll for what each tracker collects and the full activity log.');

      lastAnalysis = {
        url: data.url,
        hostname: data.hostname,
        timestamp: data.timestamp,
        trackers,
        grade: gradeInfo.grade,
        gradeText: gradeInfo.text,
        totalTrackers: trackers.length,
        countries,
        cookies,
        thirdPartyHostCount,
        thirdPartyHosts,
        thirdPartyHostTotal,
        thirdPartyHostsTruncated,
        urlSignalCount: urls.length,
        scanLog: log.slice(-24),
        storageScan,
        scopeStats,
      };

      await chrome.storage.local.set({
        lastAnalysis: slimForStorage(lastAnalysis),
        scanLive: {
          hostname,
          status: 'done',
          lines: log.slice(-MAX_SCAN_LOG_LINES),
          updatedAt: Date.now(),
        },
      });

      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'getAnalysis') {
    sendResponse({ analysis: lastAnalysis });
  }
  return false;
});

ensureDatabase();
