// Content Script — broad signal harvest for tracker matching (network, DOM, hints, storage keys)

console.log('Privacy Visualizer: content script active');

const DEBOUNCE_MS = 120;
let debounceTimer = null;

/** Capture resources that appear after this script runs (SPAs, lazy loads). */
const lateResourceUrls = [];
const MAX_LATE_RESOURCES = 650;
try {
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (lateResourceUrls.length >= MAX_LATE_RESOURCES) break;
      if (e.name) lateResourceUrls.push(e.name);
    }
  });
  po.observe({ type: 'resource', buffered: false });
} catch (_) {
  /* PerformanceObserver not available */
}

const MAX_URL_SIGNALS = 1500;
const MAX_OUTBOUND_HREF_SAMPLE = 360;
/** Full host inventory can be larger than URL signals sent to the matcher. */
const MAX_THIRD_PARTY_HOSTS_SENT = 1000;

function getPageScripts() {
  const scripts = [];
  document.querySelectorAll('script[src]').forEach((script) => {
    if (script.src) scripts.push(script.src);
  });
  return scripts;
}

function getPageCookies() {
  return document.cookie;
}

function getPerformanceResourceUrls() {
  try {
    return performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Prefetch / preconnect / preload (incl. as=script, font, image, …). */
function getLinkHintUrls() {
  const rels = [
    'preconnect',
    'dns-prefetch',
    'prefetch',
    'preload',
    'prerender',
  ];
  const out = [];
  for (const rel of rels) {
    document.querySelectorAll(`link[rel='${rel}'][href]`).forEach((link) => {
      try {
        if (link.href) out.push(link.href);
      } catch {
        /* ignore */
      }
    });
  }
  return out;
}

/** Stylesheets, icons, manifests, module preloads (anything with href). */
function getLinkAssetUrls() {
  const relNeedles = [
    'stylesheet',
    'modulepreload',
    'icon',
    'shortcut',
    'apple-touch',
    'mask-icon',
    'manifest',
    'search',
  ];
  const out = [];
  document.querySelectorAll('link[href]').forEach((link) => {
    const rel = (link.rel || '').toLowerCase();
    if (!rel) return;
    if (!relNeedles.some((n) => rel.includes(n))) return;
    try {
      if (link.href) out.push(link.href);
    } catch {
      /* ignore */
    }
  });
  return out;
}

function getEmbedMediaUrls() {
  const out = [];
  const sel =
    'iframe[src], video[src], audio[src], embed[src], object[data], source[src]';
  document.querySelectorAll(sel).forEach((el) => {
    const u = el.src || el.getAttribute('data');
    if (u) out.push(u);
  });
  document.querySelectorAll('video[poster]').forEach((v) => {
    if (v.poster) out.push(v.poster);
  });
  return out;
}

function getImgSrcUrls() {
  const out = [];
  document.querySelectorAll('img[src]').forEach((img) => {
    if (img.src) out.push(img.src);
  });
  document.querySelectorAll('picture source[srcset]').forEach((src) => {
    const ss = src.getAttribute('srcset');
    if (!ss) return;
    const first = ss.split(',')[0].trim().split(/\s+/)[0];
    if (first) {
      try {
        out.push(new URL(first, document.baseURI).href);
      } catch {
        /* ignore */
      }
    }
  });
  return out;
}

/** Open Graph / Twitter / any meta whose content is an absolute URL. */
function getMetaAbsoluteUrls() {
  const out = [];
  document.querySelectorAll('meta[content]').forEach((m) => {
    const c = (m.getAttribute('content') || '').trim();
    if (!c || !/^https?:\/\//i.test(c)) return;
    out.push(c);
  });
  return out;
}

function getFormActionUrls() {
  const out = [];
  document.querySelectorAll('form[action]').forEach((form) => {
    const a = form.getAttribute('action');
    if (!a || a.startsWith('#')) return;
    try {
      out.push(new URL(a, document.baseURI).href);
    } catch {
      /* ignore */
    }
  });
  return out;
}

/** Navigator sendBeacon-style ping targets on links. */
function getPingTargets() {
  const out = [];
  document.querySelectorAll('a[ping]').forEach((a) => {
    const p = a.getAttribute('ping');
    if (!p) return;
    p.split(/[\s]+/).forEach((piece) => {
      if (piece) out.push(piece);
    });
  });
  return out;
}

function getExternalAnchorHrefs(max) {
  const out = [];
  const pageHost = window.location.hostname;
  let steps = 0;
  const cap = 14000;
  const nodes = document.querySelectorAll('a[href], area[href]');
  for (let i = 0; i < nodes.length && out.length < max && steps < cap; i++) {
    steps++;
    const href = nodes[i].href;
    if (!href || !/^https?:/i.test(href)) continue;
    try {
      const h = new URL(href).hostname;
      if (h && h !== pageHost) out.push(href);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function getWebStorageKeyNames() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(`ls:${k}`);
    }
  } catch {
    /* denied */
  }
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k) keys.push(`ss:${k}`);
    }
  } catch {
    /* denied */
  }
  return keys;
}

function mergeUrlSignals() {
  const merged = [];
  const seen = new Set();
  const stats = {
    scripts: 0,
    performanceResources: 0,
    lateResources: 0,
    linkHints: 0,
    linkAssets: 0,
    embedsMedia: 0,
    images: 0,
    metaUrls: 0,
    formActions: 0,
    pingTargets: 0,
    outboundAnchors: 0,
  };

  function pushBatch(label, urls) {
    stats[label] = urls.length;
    for (const u of urls) {
      if (merged.length >= MAX_URL_SIGNALS) return;
      if (!u || typeof u !== 'string') continue;
      const key = u.length > 600 ? u.slice(0, 600) : u;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(u);
    }
  }

  pushBatch('scripts', getPageScripts());

  const perf = getPerformanceResourceUrls();
  pushBatch('performanceResources', perf);

  const late =
    lateResourceUrls.length > MAX_LATE_RESOURCES
      ? lateResourceUrls.slice(-MAX_LATE_RESOURCES)
      : lateResourceUrls;
  pushBatch('lateResources', late);

  pushBatch('linkHints', getLinkHintUrls());
  pushBatch('linkAssets', getLinkAssetUrls());
  pushBatch('embedsMedia', getEmbedMediaUrls());
  pushBatch('images', getImgSrcUrls());
  pushBatch('metaUrls', getMetaAbsoluteUrls());
  pushBatch('formActions', getFormActionUrls());
  pushBatch('pingTargets', getPingTargets());
  pushBatch('outboundAnchors', getExternalAnchorHrefs(MAX_OUTBOUND_HREF_SAMPLE));

  return { urls: merged, stats };
}

function collectThirdPartyHosts(pageHost, baseHref) {
  const hosts = new Set();
  function addUrl(u) {
    if (!u || typeof u !== 'string') return;
    try {
      const h = new URL(u, baseHref).hostname;
      if (h && h !== pageHost) hosts.add(h);
    } catch {
      /* ignore */
    }
  }

  getPageScripts().forEach(addUrl);
  getPerformanceResourceUrls().forEach(addUrl);
  lateResourceUrls.forEach(addUrl);
  getLinkHintUrls().forEach(addUrl);
  getLinkAssetUrls().forEach(addUrl);
  getEmbedMediaUrls().forEach(addUrl);
  getImgSrcUrls().forEach(addUrl);
  getMetaAbsoluteUrls().forEach(addUrl);
  getFormActionUrls().forEach(addUrl);
  getPingTargets().forEach(addUrl);
  getExternalAnchorHrefs(MAX_OUTBOUND_HREF_SAMPLE).forEach(addUrl);

  const sorted = Array.from(hosts).sort((a, b) => a.localeCompare(b));
  const truncated = sorted.length > MAX_THIRD_PARTY_HOSTS_SENT;
  return {
    hosts: sorted.slice(0, MAX_THIRD_PARTY_HOSTS_SENT),
    totalUnique: sorted.length,
    truncated,
  };
}
function analyzePrivacy() {
  const hostname = window.location.hostname;
  const baseHref = window.location.href;
  const { urls, stats } = mergeUrlSignals();
  const cookies = getPageCookies();
  const thirdParty = collectThirdPartyHosts(hostname, baseHref);
  const storageKeyNames = getWebStorageKeyNames();

  chrome.runtime.sendMessage(
    {
      action: 'analyzePrivacy',
      data: {
        url: baseHref,
        hostname,
        urls,
        cookies,
        thirdPartyHostCount: thirdParty.totalUnique,
        thirdPartyHosts: thirdParty.hosts,
        thirdPartyHostTotal: thirdParty.totalUnique,
        thirdPartyHostsTruncated: thirdParty.truncated,
        storageKeyNames,
        scopeStats: {
          ...stats,
          storageKeys: storageKeyNames.length,
          urlCap: MAX_URL_SIGNALS,
        },
        timestamp: new Date().toISOString(),
      },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      if (response && response.success) {
        console.log('Privacy Visualizer: analysis sent');
      }
    }
  );
}

function scheduleAnalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => analyzePrivacy(), DEBOUNCE_MS);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'analyzeNow') {
    clearTimeout(debounceTimer);
    analyzePrivacy();
    sendResponse({ ok: true });
  }
  return false;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleAnalyze);
} else {
  scheduleAnalyze();
}

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => scheduleAnalyze(), { timeout: 1500 });
}

window.addEventListener('load', () => scheduleAnalyze(), { once: true });
