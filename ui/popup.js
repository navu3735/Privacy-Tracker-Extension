// Popup Script - Shows results to user
// Gets data from background worker and displays it beautifully

document.addEventListener('DOMContentLoaded', () => {
  loadAnalysis();
});

function loadAnalysis() {
  // Ask background worker for analysis results
  chrome.runtime.sendMessage({ action: 'getAnalysis' }, (response) => {
    if (response && response.analysis) {
      displayAnalysis(response.analysis);
    } else {
      // Analysis not ready yet, try again in 1 second
      setTimeout(loadAnalysis, 1000);
    }
  });
}

function displayAnalysis(analysis) {
  const { grade, gradeText, trackers, countries, totalTrackers, cookies } = analysis;
  
  let html = `
    <!-- Grade Card -->
    <div class="grade-card">
      <div class="grade-label">Privacy Score</div>
      <div class="grade-display ${grade}">${grade}</div>
      <div class="grade-text">${gradeText} Privacy</div>
      <div class="grade-subtext">${totalTrackers} tracker${totalTrackers !== 1 ? 's' : ''} detected</div>
    </div>
  `;
  
  // Trackers section
  if (trackers && trackers.length > 0) {
    html += `
      <div class="section">
        <div class="section-title">🕵️ Tracking Scripts (${totalTrackers})</div>
        <div class="tracker-list">
    `;
    
    trackers.forEach(tracker => {
      const riskClass = tracker.risk.toLowerCase();
      html += `
        <div class="tracker-item ${riskClass}">
          <div class="tracker-name">${tracker.name}</div>
          <div class="tracker-meta">
            <span class="tracker-badge">${tracker.category.toUpperCase()}</span>
            <span class="tracker-badge risk-${riskClass}">Risk: ${tracker.risk.toUpperCase()}</span>
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
      <div class="section" style="background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%); border-left: 4px solid #0369a1;">
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
          <div style="color: #0369a1; font-weight: 600; font-size: 14px;">No Known Trackers Found!</div>
          <div style="color: #0369a1; opacity: 0.8; font-size: 12px; margin-top: 4px;">This site has minimal tracking</div>
        </div>
      </div>
    `;
  }
  
  // Countries section
  if (countries && countries.length > 0) {
    html += `
      <div class="section">
        <div class="section-title">🌍 Data Destinations</div>
        <div class="countries-container">
    `;
    
    countries.forEach(country => {
      html += `<span class="country-tag">${country}</span>`;
    });
    
    html += `
        </div>
      </div>
    `;
  }
  
  // Tracking cookies info
  if (cookies && cookies.trackingCookies.length > 0) {
    html += `
      <div class="section">
        <div class="section-title">🍪 Tracking Cookies (${cookies.trackingCookies.length})</div>
        <div class="cookie-warning">
          <strong>Found tracking cookies:</strong><br>
          ${cookies.trackingCookies.slice(0, 5).join(', ')}${cookies.trackingCookies.length > 5 ? '...' : ''}
        </div>
      </div>
    `;
  }
  
  // Privacy tips
  html += `
    <div class="section" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #16a34a;">
      <div class="section-title">💡 Privacy Tips</div>
      <ul class="tips-list">
        <li>Use privacy-focused search engines (DuckDuckGo)</li>
        <li>Enable "Do Not Track" in browser settings</li>
        <li>Clear cookies regularly (Settings → Privacy)</li>
        <li>Use a VPN for extra protection</li>
        <li>Install ad blockers (uBlock Origin)</li>
      </ul>
    </div>
  `;
  
  document.getElementById('results').innerHTML = html;
}
