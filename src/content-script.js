// Content Script - Runs on every webpage
// This is your "detective" that collects tracker information

console.log("🔍 Privacy Visualizer: Starting analysis...");

// Step 1: Collect all script sources from the page
function getPageScripts() {
  const scripts = [];
  const scriptTags = document.querySelectorAll('script');
  
  scriptTags.forEach(script => {
    if (script.src) {
      scripts.push(script.src);
    }
  });
  
  console.log(`Found ${scripts.length} scripts on page`);
  return scripts;
}

// Step 2: Get all cookies
function getPageCookies() {
  return document.cookie;
}

// Step 3: Get external links (where data might be sent)
function getExternalDomains() {
  const domains = new Set();
  const currentDomain = window.location.hostname;
  
  // Check images
  document.querySelectorAll('img').forEach(img => {
    if (img.src) {
      const url = new URL(img.src, window.location.href);
      if (url.hostname !== currentDomain) {
        domains.add(url.hostname);
      }
    }
  });
  
  // Check iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    if (iframe.src) {
      const url = new URL(iframe.src, window.location.href);
      if (url.hostname !== currentDomain) {
        domains.add(url.hostname);
      }
    }
  });
  
  console.log(`Found ${domains.size} external domains`);
  return Array.from(domains);
}

// Step 4: Run analysis and send to background
function analyzePrivacy() {
  const scripts = getPageScripts();
  const cookies = getPageCookies();
  const domains = getExternalDomains();
  
  // Send data to background script for processing
  chrome.runtime.sendMessage({
    action: 'analyzePrivacy',
    data: {
      url: window.location.href,
      hostname: window.location.hostname,
      scripts: scripts,
      cookies: cookies,
      domains: domains,
      timestamp: new Date().toISOString()
    }
  }, (response) => {
    if (response && response.success) {
      console.log('✅ Analysis complete');
    }
  });
}

// Run analysis when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', analyzePrivacy);
} else {
  analyzePrivacy();
}
