// Popup — live “background” log via scanLive + results for the active tab

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

function getActivePageHost(tabs) {
  const tab = tabs && tabs[0];
  if (!tab?.url) return { host: '', tabId: tab?.id };
  try {
    return { host: new URL(tab.url).hostname, tabId: tab.id };
  } catch {
    return { host: '', tabId: tab.id };
  }
}

function mountLiveLogShell(title, subtitle) {
  const el = document.getElementById('results');
  el.innerHTML = `
    <div class="loading-wrap glass-panel">
      <div class="loading-top">
        <div class="loading-spinner"></div>
        <div>
          <div class="loading-text">${title || 'Scanning…'}</div>
          <div class="loading-hint">${subtitle || 'Live steps from the background worker appear below.'}</div>
        </div>
      </div>
      <div class="live-log glass-panel-inner" id="live-log" aria-live="polite"></div>
    </div>
  `;
}

function renderLiveLogLines(lines, status) {
  const logEl = document.getElementById('live-log');
  if (!logEl || !lines || !lines.length) return;
  const suffix =
    status === 'done'
      ? '<div class="log-line log-line--dim">— session complete —</div>'
      : '';
  logEl.innerHTML =
    lines.map((line) => formatLogLine(line)).join('') + suffix;
  logEl.scrollTop = logEl.scrollHeight;
}

function formatLogLine(line) {
  const safe = escapeHtml(line);
  return `<div class="log-line">${safe}</div>`;
}

function showUnavailable(detail) {
  const el = document.getElementById('results');
  el.innerHTML = `
    <div class="empty-state glass-panel">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-text">${detail || 'Cannot analyze this page'}</div>
      <div class="empty-state-subtext">Try a normal http(s) website.</div>
    </div>
  `;
}

function initPopup() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    if (
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('devtools://')
    ) {
      showUnavailable('Built-in or restricted pages cannot be scanned.');
      return;
    }

    const { host, tabId } = getActivePageHost(tabs);
    if (!host || !tabId) {
      showUnavailable('No active tab to scan.');
      return;
    }

    const activeHost = host;

    chrome.storage.local.get(['lastAnalysis', 'scanLive'], (data) => {
      const a = data.lastAnalysis;
      const live = data.scanLive;

      if (live && live.hostname === activeHost && live.status === 'running') {
        mountLiveLogShell('Scanning this tab…', 'Background worker steps stream here.');
        if (live.lines?.length) {
          renderLiveLogLines(live.lines, live.status);
        }
        return;
      }

      if (a && a.hostname === activeHost) {
        displayAnalysis(a);
        return;
      }

      mountLiveLogShell('Scanning this tab…', 'Background worker steps stream here.');
      if (live && live.hostname === activeHost && live.lines?.length) {
        renderLiveLogLines(live.lines, live.status);
      }
    });

    chrome.tabs.sendMessage(tabId, { action: 'analyzeNow' }, () => {
      if (chrome.runtime.lastError) {
        mountLiveLogShell(
          'Waiting for page…',
          'Try refreshing the page if this stays empty.'
        );
      }
    });

    chrome.storage.onChanged.addListener(function onStore(changes, area) {
      if (area !== 'local') return;

      if (changes.scanLive) {
        const live = changes.scanLive.newValue;
        if (live && live.hostname === activeHost && live.lines) {
          if (live.status === 'running') {
            const resultsEl = document.getElementById('results');
            if (resultsEl && !resultsEl.querySelector('#live-log')) {
              mountLiveLogShell('Scanning this tab…');
            }
          }
          renderLiveLogLines(live.lines, live.status);
        }
      }

      if (changes.lastAnalysis) {
        const next = changes.lastAnalysis.newValue;
        if (next && next.hostname === activeHost) {
          displayAnalysis(next);
        }
      }
    });
  });
}

function displayAnalysis(analysis) {
  const {
    grade,
    gradeText,
    trackers,
    countries,
    totalTrackers,
    cookies,
    thirdPartyHostCount,
    urlSignalCount,
    scanLog,
    scopeStats,
    storageScan,
    thirdPartyHosts,
    thirdPartyHostTotal,
    thirdPartyHostsTruncated,
  } = analysis;

  const hostList = Array.isArray(thirdPartyHosts) ? thirdPartyHosts : [];
  const hostTotal =
    typeof thirdPartyHostTotal === 'number' ? thirdPartyHostTotal : hostList.length;
  const hostTrunc = !!thirdPartyHostsTruncated;

  const hosts =
    typeof thirdPartyHostCount === 'number' ? thirdPartyHostCount : hostTotal;
  const signals =
    typeof urlSignalCount === 'number' ? urlSignalCount : '—';

  let html = `
    <div class="stats-row glass-panel">
      <div class="stat-pill">
        <span class="stat-label">Distinct third-party hosts</span>
        <span class="stat-value">${hosts}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">URL signals</span>
        <span class="stat-value">${signals}</span>
      </div>
    </div>
  `;

  if (scopeStats && typeof scopeStats === 'object') {
    const net =
      (scopeStats.performanceResources || 0) + (scopeStats.lateResources || 0);
    html += `
      <div class="section glass-panel scope-panel">
        <div class="section-title">Scan scope</div>
        <p class="scope-blurb">
          Network ${net} · scripts ${scopeStats.scripts ?? 0} · hints ${scopeStats.linkHints ?? 0}
          · assets ${scopeStats.linkAssets ?? 0} · embeds ${scopeStats.embedsMedia ?? 0}
          · images ${scopeStats.images ?? 0} · meta ${scopeStats.metaUrls ?? 0}
          · forms ${scopeStats.formActions ?? 0} · pings ${scopeStats.pingTargets ?? 0}
          · outbound ${scopeStats.outboundAnchors ?? 0}
          · local/session keys ${scopeStats.storageKeys ?? 0}
          (≤${scopeStats.urlCap ?? '—'} URLs to matcher)
        </p>
      </div>
    `;
  }

  html += `
    <div class="grade-card glass-panel">
      <div class="grade-label">Privacy score</div>
      <div class="grade-display ${grade}">${grade}</div>
      <div class="grade-text">${gradeText} privacy</div>
      <div class="grade-subtext">${totalTrackers} known tracker${
        totalTrackers !== 1 ? 's' : ''
      } · wide DOM + network + storage-key sweep</div>
    </div>
  `;

  if (trackers && trackers.length > 0) {
    const namesLine = trackers.map((t) => escapeHtml(t.name)).join(', ');
    html += `
      <div class="section glass-panel">
        <div class="section-title">Known tracker services (${totalTrackers})</div>
        <p class="tracker-names-inline">${namesLine}</p>
        <div class="tracker-list">
    `;

    trackers.forEach((tracker) => {
      const riskClass = String(tracker.risk).toLowerCase();
      const collects = Array.isArray(tracker.dataCollected)
        ? tracker.dataCollected.slice(0, 5).map(escapeHtml).join(' · ')
        : '';
      const doms = Array.isArray(tracker.domains)
        ? tracker.domains.slice(0, 8).map(escapeHtml).join(', ')
        : '';
      html += `
        <div class="tracker-item ${riskClass}">
          <div class="tracker-name">${escapeHtml(tracker.name)}</div>
          ${doms ? `<div class="tracker-domains">Signature domains &amp; paths: ${doms}</div>` : ''}
          <div class="tracker-does">${collects || 'Category: tracking / analytics (see vendor policy for detail.)'}</div>
          <div class="tracker-meta">
            <span class="tracker-badge">${escapeHtml(
              String(tracker.category).toUpperCase()
            )}</span>
            <span class="tracker-badge risk-${riskClass}">Risk: ${escapeHtml(
              String(tracker.risk).toUpperCase()
            )}</span>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="section glass-panel glow-ok">
        <div class="empty-inline">
          <div class="empty-inline-icon">✓</div>
          <div>
            <div class="empty-inline-title">No known tracker services matched our database</div>
            <div class="empty-inline-sub">Third-party hostnames below may still include analytics or ads we do not label yet.</div>
          </div>
        </div>
      </div>
    `;
  }

  {
    const truncNote = hostTrunc
      ? `<p class="scope-blurb">Showing ${hostList.length} of ${hostTotal} hostnames (extension cap). Rescan after navigation for updates.</p>`
      : '';
    const rows =
      hostList.length > 0
        ? hostList.map((h) => `<div class="host-row">${escapeHtml(h)}</div>`).join('')
        : `<p class="scope-blurb">No third-party hostnames found in collected URLs for this page.</p>`;
    html += `
      <div class="section glass-panel">
        <div class="section-title">Third-party hostnames (${hostTotal})</div>
        ${truncNote}
        <div class="host-list glass-panel-inner">${rows}</div>
      </div>
    `;
  }

  if (countries && countries.length > 0) {
    html += `
      <div class="section glass-panel">
        <div class="section-title">Data destinations</div>
        <div class="countries-container">
    `;

    countries.forEach((country) => {
      html += `<span class="country-tag">${escapeHtml(country)}</span>`;
    });

    html += `
        </div>
      </div>
    `;
  }

  if (cookies && cookies.trackingCookies && cookies.trackingCookies.length > 0) {
    const list = cookies.trackingCookies.slice(0, 5).map(escapeHtml).join(', ');
    const more =
      cookies.trackingCookies.length > 5
        ? ` +${cookies.trackingCookies.length - 5} more`
        : '';
    html += `
      <div class="section glass-panel">
        <div class="section-title">Tracking cookies (${cookies.trackingCookies.length})</div>
        <div class="cookie-warning">
          <strong>Cookie names:</strong><br>
          ${list}${more}
        </div>
      </div>
    `;
  }

  if (storageScan && typeof storageScan.total === 'number') {
    const flagged = storageScan.flagged || [];
    if (flagged.length > 0) {
      const fl = flagged.slice(0, 8).map(escapeHtml).join(', ');
      const more = flagged.length > 8 ? ` +${flagged.length - 8} more` : '';
      html += `
        <div class="section glass-panel">
          <div class="section-title">Web storage keys (${storageScan.total})</div>
          <div class="cookie-warning">
            <strong>Possibly tracking-related key names</strong> (values never read):<br>
            ${fl}${more}
          </div>
        </div>
      `;
    } else if (storageScan.total > 0) {
      html += `
        <div class="section glass-panel">
          <div class="section-title">Web storage keys (${storageScan.total})</div>
          <p class="scope-blurb">No key names matched our heuristic list; trackers may still use opaque keys.</p>
        </div>
      `;
    }
  }

  const logLines = Array.isArray(scanLog) ? scanLog : [];
  if (logLines.length) {
    html += `
      <div class="section glass-panel">
        <div class="section-title">Background activity (this scan)</div>
        <div class="live-log live-log--static glass-panel-inner">
          ${logLines.map((l) => `<div class="log-line">${escapeHtml(l)}</div>`).join('')}
        </div>
      </div>
    `;
  }

  html += `
    <div class="section glass-panel tips-panel">
      <div class="section-title">Quick tips</div>
      <ul class="tips-list">
        <li>Use a privacy-focused search engine when you can</li>
        <li>Review site permissions (location, notifications)</li>
        <li>Clear third-party cookies periodically</li>
        <li>A reputable content blocker cuts most tracker calls</li>
      </ul>
    </div>
  `;

  document.getElementById('results').innerHTML = html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
