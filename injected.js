// Runs in PAGE context to intercept API responses
(function() {
  if (window.__geminiTimestampInterceptor) return;
  window.__geminiTimestampInterceptor = true;
  
  function processResponse(text) {
    // Parse timestamps [seconds, nanos] from API response
    const tsRegex = /\[(\d{10}),\s*(\d+)\]/g;
    const timestamps = [];
    let m;
    while ((m = tsRegex.exec(text)) !== null) {
      const sec = parseInt(m[1]);
      // Valid Unix timestamp range (2020-2030)
      if (sec > 1577836800 && sec < 1893456000) {
        timestamps.push(sec * 1000);
      }
    }
    
    // Get current chat ID from URL
    const urlMatch = window.location.href.match(/\/app\/([a-f0-9]+)/);
    const chatId = urlMatch ? urlMatch[1] : null;
    
    if (timestamps.length > 0 && chatId) {
      // Filter to past timestamps only (ignore future token expiry times)
      const now = Date.now();
      const pastTimestamps = timestamps.filter(ts => ts < now);
      
      if (pastTimestamps.length > 0) {
        // Earliest past timestamp = conversation creation time
        const earliest = Math.min(...pastTimestamps);
        window.postMessage({ type: 'GEMINI_TIMESTAMP', chatId, timestamp: earliest }, '*');
      }
    }
  }
  
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = (args[0]?.url || args[0] || '').toString();
    
    if (url.includes('batchexecute') || url.includes('BardFrontendService') || url.includes('_/BardChat')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        processResponse(text);
      } catch (e) {}
    }
    return response;
  };
  
  // Intercept XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._geminiUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._geminiUrl || '';
    if (url.includes('batchexecute') || url.includes('BardFrontendService') || url.includes('_/BardChat')) {
      this.addEventListener('load', function() {
        try { processResponse(this.responseText); } catch (e) {}
      });
    }
    return originalXHRSend.apply(this, args);
  };
})();
