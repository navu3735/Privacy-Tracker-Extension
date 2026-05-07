// Background Service Worker
// Processes and analyzes tracker data
// This is the "judge" that compares findings against known trackers

console.log("📊 Privacy Visualizer: Background worker loaded");

let trackerDatabase = [];
let lastAnalysis = null;

// Load tracker database from JSON file
async function loadTrackerDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/trackers.json'));
    const data = await response.json();
    trackerDatabase = data.trackers;
    console.log(`✅ Loaded ${trackerDatabase.length} trackers`);
  } catch (error) {
    console.error('❌ Error loading tracker database:', error);
  }
}

// Find which trackers are on the page
function findTrackers(scripts, domains) {
  const foundTrackers = new Set();
  const allItems = [...scripts, ...domains];
  
  trackerDatabase.forEach(tracker => {
    tracker.domains.forEach(domain => {
      allItems.forEach(item => {
        if (item.toLowerCase().includes(domain.toLowerCase())) {
          foundTrackers.add(tracker.id);
        }
      });
    });
  });
  
  // Convert Set back to array of tracker objects
  const result = Array.from(foundTrackers).map(id => {
    return trackerDatabase.find(t => t.id === id);
  });
  
  console.log(`🎯 Found ${result.length} trackers`);
  return result;
}

// Calculate privacy grade
function calculateGrade(trackerCount, riskScores) {
  // A = 0, B = 1-2, C = 3-4, D = 5-6, F = 7+
  if (trackerCount === 0) return { grade: 'A', text: 'Excellent' };
  if (trackerCount <= 2) return { grade: 'B', text: 'Good' };
  if (trackerCount <= 4) return { grade: 'C', text: 'Fair' };
  if (trackerCount <= 6) return { grade: 'D', text: 'Poor' };
  return { grade: 'F', text: 'Bad' };
}

// Analyze cookies for tracking patterns
function analyzeCookies(cookieString) {
  if (!cookieString) return { count: 0, trackingCookies: [] };
  
  const cookies = cookieString.split(';');
  const trackingPatterns = ['utm_', 'ga_', '_ga', 'fbp', '_fb', '_gat'];
  const trackingCookies = [];
  
  cookies.forEach(cookie => {
    const trimmed = cookie.trim();
    const hasTracking = trackingPatterns.some(pattern => 
      trimmed.toLowerCase().includes(pattern)
    );
    if (hasTracking) {
      trackingCookies.push(trimmed.split('=')[0]);
    }
  });
  
  return {
    count: cookies.length,
    trackingCookies: trackingCookies
  };
}

// Get countries where trackers send data
function getCountries(trackers) {
  const countryMap = {
    'google-analytics': ['USA', 'Europe'],
    'facebook-pixel': ['USA', 'Europe', 'Asia'],
    'google-ads': ['USA', 'Europe'],
    'twitter-analytics': ['USA'],
    'linkedin': ['USA', 'Europe'],
    'hotjar': ['Europe', 'USA'],
    'mixpanel': ['USA'],
    'amplitude': ['USA'],
    'criteo': ['USA', 'Europe'],
    'appnexus': ['USA']
  };
  
  const countries = new Set();
  trackers.forEach(tracker => {
    const locs = countryMap[tracker.id] || [];
    locs.forEach(loc => countries.add(loc));
  });
  
  return Array.from(countries);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzePrivacy') {
    console.log('🔬 Processing data from:', request.data.hostname);
    
    // Find trackers
    const trackers = findTrackers(
      request.data.scripts, 
      request.data.domains
    );
    
    // Calculate grade
    const gradeInfo = calculateGrade(trackers.length);
    
    // Analyze cookies
    const cookies = analyzeCookies(request.data.cookies);
    
    // Get countries
    const countries = getCountries(trackers);
    
    // Build analysis result
    lastAnalysis = {
      url: request.data.url,
      hostname: request.data.hostname,
      timestamp: request.data.timestamp,
      trackers: trackers,
      grade: gradeInfo.grade,
      gradeText: gradeInfo.text,
      totalTrackers: trackers.length,
      countries: countries,
      cookies: cookies,
      scripts: request.data.scripts,
      domains: request.data.domains
    };
    
    console.log('✅ Analysis complete:', lastAnalysis);
    
    // Save to storage
    chrome.storage.local.set({ lastAnalysis: lastAnalysis });
    
    sendResponse({ success: true });
  }
  
  if (request.action === 'getAnalysis') {
    sendResponse({ analysis: lastAnalysis });
  }
});

// Load tracker database on startup
loadTrackerDatabase();
