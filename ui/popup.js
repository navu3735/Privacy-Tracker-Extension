// Popup Script - Shows results to user
// Gets data from background worker and displays it nicely

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
      document.getElementById('results').innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <p>⏳ Analyzing page...</p>
          <p style="font-size: 12px; color: #999;">This usually takes 1-2 seconds</p>
        </div>
      `;
      setTimeout(loadAnalysis, 1000);
    }
  });
}

function displayAnalysis(analysis) {
  const { grade, gradeText, trackers, countries, totalTrackers, cookies } = analysis;
  
  // Color code for grades
  const gradeColors = {
    'A': '#10b981',
    'B': '#3b82f6',
    'C': '#f59e0b',
    'D': '#ef5350',
    'F': '#dc2626'
  };
  
  let html = `
    <!-- Grade Card -->
    <div style="text-align: center; background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 5px;">YOUR PRIVACY SCORE</div>
      <div style="
        font-size: 48px; 
        font-weight: bold; 
        color: ${gradeColors[grade]};
        margin: 10px 0;
      ">${grade}</div>
      <div style="font-size: 14px; color: #333;">${gradeText} Privacy</div>
    </div>
  `;
  
  // Trackers section
  if (trackers && trackers.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; color: #333; margin-bottom: 10px;">
          🕵️ Found ${totalTrackers} Tracker(s)
        </div>
    `;
    
    trackers.forEach(tracker => {
      const riskColor = tracker.risk === 'high' ? '#ef5350' : '#f59e0b';
      html += `
        <div style="
          background: #f9fafb;
          padding: 10px;
          margin-bottom: 8px;
          border-left: 3px solid ${riskColor};
          border-radius: 4px;
        ">
          <div style="font-weight: bold; color: #333;">${tracker.name}</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            📊 ${tracker.category.toUpperCase()} | Risk: <span style="color: ${riskColor}; font-weight: bold;">${tracker.risk.toUpperCase()}</span>
          </div>
          <div style="font-size: 11px; color: #999; margin-top: 4px;">
            ${tracker.dataCollected.join(', ')}
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  } else {
    html += `
      <div style="
        background: #dbeafe;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
        margin-bottom: 15px;
        color: #0369a1;
      ">
        ✅ No known trackers found!
      </div>
    `;
  }
  
  // Countries section
  if (countries && countries.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; color: #333; margin-bottom: 8px;">🌍 Data Sent To</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
    `;
    
    countries.forEach(country => {
      html += `
        <span style="
          background: #e5e7eb;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          color: #374151;
        ">${country}</span>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  }
  
  // Tracking cookies info
  if (cookies && cookies.trackingCookies.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; color: #333; margin-bottom: 8px;">🍪 Tracking Cookies Found</div>
        <div style="background: #fef3c7; padding: 10px; border-radius: 6px; font-size: 12px; color: #78350f;">
          ${cookies.trackingCookies.join(', ')}
        </div>
      </div>
    `;
  }
  
  // Tips section
  html += `
    <div style="
      background: #f0fdf4;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #166534;
      border-left: 3px solid #16a34a;
    ">
      <div style="font-weight: bold; margin-bottom: 6px;">💡 Tips to Stay Private</div>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Use privacy-focused search engines</li>
        <li>Enable "Do Not Track" in browser settings</li>
        <li>Clear cookies regularly</li>
        <li>Use a VPN for extra protection</li>
      </ul>
    </div>
  `;
  
  document.getElementById('results').innerHTML = html;
}
