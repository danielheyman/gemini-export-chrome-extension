// Gemini Export - Content Script

(function() {
  'use strict';
  if (window.__geminiExportLoaded) return;
  window.__geminiExportLoaded = true;
  
  console.log('[Gemini Export] Content script ready');
  
  // Timestamp cache: maps conversation ID to timestamp
  const timestampCache = new Map();
  
  // Install fetch interceptor to capture API responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0]?.url || args[0] || '';
    
    if (url.includes('batchexecute') || url.includes('conversation')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        parseTimestampsFromResponse(text, getCurrentChatId());
      } catch (e) {}
    }
    
    return response;
  };
  
  // Also intercept XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._geminiUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._geminiUrl && (this._geminiUrl.includes('batchexecute') || this._geminiUrl.includes('conversation'))) {
      this.addEventListener('load', function() {
        try {
          parseTimestampsFromResponse(this.responseText, getCurrentChatId());
        } catch (e) {}
      });
    }
    return originalXHRSend.apply(this, args);
  };
  
  function getCurrentChatId() {
    const match = window.location.href.match(/\/app\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }
  
  function parseTimestampsFromResponse(text, currentChatId) {
    // Look for timestamp patterns: [seconds, nanos] where seconds is 10 digits starting with 17
    const timestampRegex = /\[(\d{10}),\s*(\d+)\]/g;
    const convIdRegex = /c_([a-f0-9]{16})/g;
    
    // Extract all timestamps
    const timestamps = [];
    let match;
    while ((match = timestampRegex.exec(text)) !== null) {
      const seconds = parseInt(match[1]);
      // Sanity check: should be a reasonable Unix timestamp (2020-2030)
      if (seconds > 1577836800 && seconds < 1893456000) {
        timestamps.push(seconds * 1000);
      }
    }
    
    // Extract conversation IDs from response
    const convIds = [];
    while ((match = convIdRegex.exec(text)) !== null) {
      convIds.push(match[1]);
    }
    
    // Get the earliest timestamp (likely creation time)
    if (timestamps.length > 0) {
      const ts = Math.min(...timestamps);
      
      // Map to API conversation IDs
      for (const id of convIds) {
        if (!timestampCache.has(id)) {
          timestampCache.set(id, ts);
          console.log(`[Gemini Export] Captured timestamp for c_${id}: ${new Date(ts).toISOString()}`);
        }
      }
      
      // Also map to current URL-based chat ID if available
      if (currentChatId && !timestampCache.has(currentChatId)) {
        timestampCache.set(currentChatId, ts);
        console.log(`[Gemini Export] Captured timestamp for ${currentChatId}: ${new Date(ts).toISOString()}`);
      }
    }
  }
  
  function getTimestampForChat(chatId) {
    // Try direct match
    if (timestampCache.has(chatId)) {
      return timestampCache.get(chatId);
    }
    // Try with c_ prefix stripped/added
    if (timestampCache.has('c_' + chatId)) {
      return timestampCache.get('c_' + chatId);
    }
    return null;
  }
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RUN_EXPORT') {
      runExport(request.forceRefresh, request.cachedIds || []).then(result => {
        sendResponse(result);
      });
      return true;
    }
  });
  
  function sendProgress(current, total, status) {
    chrome.runtime.sendMessage({
      action: 'PROGRESS_UPDATE',
      progress: { current, total, status }
    }).catch(() => {});
  }
  
  async function runExport(forceRefresh, cachedIds) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cachedSet = new Set(cachedIds);
    
    function getChatLinks() {
      const sidenav = document.querySelector('bard-sidenav, side-navigation-v2');
      if (!sidenav) return [];
      
      const links = sidenav.querySelectorAll('a');
      const chats = [];
      const seen = new Set();
      
      for (const a of links) {
        const href = a.href || '';
        if (!href.match(/\/app\/[a-f0-9]{10,}/)) continue;
        
        const text = (a.innerText || '').replace(/\n/g, ' ').trim();
        const title = text.replace(/\s*Pinned chat\s*$/, '').trim();
        const id = href.match(/\/app\/([a-f0-9]+)/)?.[1];
        
        if (!id || seen.has(id)) continue;
        seen.add(id);
        
        chats.push({ id, title, url: href, element: a, cached: cachedSet.has(id) });
      }
      
      return chats;
    }
    
    function extractMessages() {
      const messages = [];
      
      // Method 1: user-query elements
      const userQueries = document.querySelectorAll('user-query');
      
      for (const uq of userQueries) {
        const textEl = uq.querySelector('.query-text, .query-text-line, p');
        const userText = textEl?.innerText?.trim() || uq.innerText?.trim();
        
        if (!userText || userText.length < 2) continue;
        messages.push({ role: 'user', content: userText });
        
        let container = uq.closest('.conversation-container') || uq.parentElement?.parentElement;
        let modelEl = container?.querySelector('model-response .markdown, .model-response-text .markdown');
        
        if (!modelEl && container) {
          let sibling = container.nextElementSibling;
          while (sibling) {
            modelEl = sibling.querySelector?.('.markdown');
            if (modelEl) break;
            if (sibling.querySelector?.('user-query')) break;
            sibling = sibling.nextElementSibling;
          }
        }
        
        if (modelEl) {
          const modelText = modelEl.innerText?.trim();
          if (modelText) messages.push({ role: 'model', content: modelText });
        }
      }
      
      // Method 2: conversation-container
      if (messages.length === 0) {
        const containers = document.querySelectorAll('.conversation-container');
        for (const c of containers) {
          const userEl = c.querySelector('user-query .query-text, user-query p');
          const modelEl = c.querySelector('model-response .markdown, .model-response-text .markdown');
          
          if (userEl) messages.push({ role: 'user', content: userEl.innerText?.trim() });
          if (modelEl) messages.push({ role: 'model', content: modelEl.innerText?.trim() });
        }
      }
      
      return messages;
    }
    
    sendProgress(0, 0, 'Finding chats...');
    
    const chatLinks = getChatLinks();
    
    if (chatLinks.length === 0) {
      return { error: 'No chats found. Make sure sidebar is visible.' };
    }
    
    const toFetch = chatLinks.filter(c => !c.cached);
    const allIds = chatLinks.map(c => c.id);
    
    sendProgress(0, toFetch.length, `Found ${chatLinks.length} chats (${toFetch.length} to fetch, ${chatLinks.length - toFetch.length} cached)`);
    
    if (toFetch.length === 0) {
      return { chats: [], allIds };
    }
    
    const exportedChats = [];
    
    for (let i = 0; i < toFetch.length; i++) {
      const chat = toFetch[i];
      
      sendProgress(i + 1, toFetch.length, `Fetching ${i + 1}/${toFetch.length}: ${chat.title.substring(0, 30)}...`);
      
      chat.element.click();
      await sleep(2000); // Slightly longer to capture API response
      
      const messages = extractMessages();
      const timestamp = getTimestampForChat(chat.id);
      
      exportedChats.push({
        id: chat.id,
        title: chat.title,
        url: chat.url,
        createdAt: timestamp ? new Date(timestamp).toISOString() : null,
        exportedAt: new Date().toISOString(),
        messages: messages
      });
      
      await sleep(400);
    }
    
    sendProgress(toFetch.length, toFetch.length, 'Processing...');
    
    return { chats: exportedChats, allIds };
  }
})();
