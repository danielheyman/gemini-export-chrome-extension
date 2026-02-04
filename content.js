// Gemini Export - Content Script

(function() {
  'use strict';
  if (window.__geminiExportLoaded) return;
  window.__geminiExportLoaded = true;
  
  // Timestamp cache
  const timestampCache = new Map();
  
  // Listen for timestamps from page context
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'GEMINI_TIMESTAMP') {
      timestampCache.set(event.data.chatId, event.data.timestamp);
    }
  });
  
  // Inject interceptor into page context (external file bypasses CSP)
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  (document.head || document.documentElement).appendChild(script);
  
  function getTimestampForChat(chatId) {
    return timestampCache.get(chatId) || null;
  }
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RUN_EXPORT') {
      runExport({
        forceRefresh: request.forceRefresh,
        cachedIds: request.cachedIds || [],
        autoScroll: request.autoScroll,
        scrollLimit: request.scrollLimit || 100
      }).then(result => {
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
  
  async function runExport(opts) {
    const { forceRefresh, cachedIds, autoScroll, scrollLimit } = opts;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cachedSet = new Set(cachedIds);
    
    // Auto-scroll the sidebar to load more chats
    async function scrollSidebar(limit) {
      const sidenav = document.querySelector('bard-sidenav, side-navigation-v2');
      if (!sidenav) return;
      
      // Find the scrollable container within sidenav
      const scrollContainer = sidenav.querySelector('[style*="overflow"]') || 
                              sidenav.querySelector('.chat-history') ||
                              sidenav;
      
      let prevCount = 0;
      let sameCountStreak = 0;
      
      while (true) {
        const currentCount = getChatLinks().length;
        sendProgress(0, 0, `Scrolling... Found ${currentCount} chats (limit: ${limit})`);
        
        if (currentCount >= limit) {
          sendProgress(0, 0, `Reached limit of ${limit} chats`);
          break;
        }
        
        if (currentCount === prevCount) {
          sameCountStreak++;
          if (sameCountStreak >= 3) {
            sendProgress(0, 0, `No more chats to load (found ${currentCount})`);
            break;
          }
        } else {
          sameCountStreak = 0;
        }
        prevCount = currentCount;
        
        // Scroll down
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        await sleep(800);
      }
    }
    
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
    
    // Auto-scroll if enabled
    if (autoScroll) {
      await scrollSidebar(scrollLimit);
    }
    
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
      await sleep(2000); // Wait for API response with timestamps
      
      const messages = extractMessages();
      const timestamp = getTimestampForChat(chat.id);
      
      const chatData = {
        id: chat.id,
        title: chat.title,
        url: chat.url,
        createdAt: timestamp ? new Date(timestamp).toISOString() : null,
        exportedAt: new Date().toISOString(),
        messages: messages
      };
      
      exportedChats.push(chatData);
      
      // Cache immediately after each chat (crash protection)
      chrome.runtime.sendMessage({ action: 'CACHE_CHAT', chat: chatData }).catch(() => {});
      
      await sleep(400);
    }
    
    sendProgress(toFetch.length, toFetch.length, 'Processing...');
    
    return { chats: exportedChats, allIds };
  }
})();
