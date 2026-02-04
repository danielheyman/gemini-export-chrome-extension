// Gemini Export - Background Service Worker

importScripts('jszip.min.js');

console.log('[Gemini Export] Service worker loaded');

const DB_NAME = 'gemini-export-cache';
const DB_VERSION = 1;

let exportState = {
  isExporting: false,
  progress: { current: 0, total: 0, status: '' }
};

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'id' });
      }
    };
  });
}

async function cacheChat(chat) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    store.put(chat);
    tx.oncomplete = () => resolve();
  });
}

async function getAllCached() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chats', 'readonly');
    const store = tx.objectStore('chats');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function clearCache() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    store.clear();
    tx.oncomplete = () => resolve();
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROGRESS_UPDATE') {
    exportState.progress = request.progress;
    broadcastProgress();
    return;
  }
  
  if (request.action === 'START_EXPORT') {
    let tabId = request.tabId || sender.tab?.id;
    const opts = {
      format: request.format,
      forceRefresh: request.forceRefresh,
      autoScroll: request.autoScroll,
      scrollLimit: request.scrollLimit || 100
    };
    
    if (!tabId) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url?.includes('gemini.google.com')) {
          handleExport(opts, tabs[0].id);
        } else {
          exportState.progress.status = 'Error: Open Gemini first';
          broadcastProgress();
        }
      });
    } else {
      handleExport(opts, tabId);
    }
    sendResponse({ started: true });
  }
  
  if (request.action === 'GET_PROGRESS') {
    sendResponse(exportState);
  }
  
  if (request.action === 'GET_CACHE_STATS') {
    getAllCached().then(chats => {
      sendResponse({ count: chats.length });
    });
    return true;
  }
  
  if (request.action === 'CLEAR_CACHE') {
    clearCache().then(() => sendResponse({ cleared: true }));
    return true;
  }
  
  if (request.action === 'CACHE_CHAT') {
    cacheChat(request.chat).then(() => sendResponse({ cached: true }));
    return true;
  }
  
  return true;
});

async function handleExport(opts, sourceTabId) {
  if (exportState.isExporting) return;
  
  const { format = 'json', forceRefresh = false, autoScroll = false, scrollLimit = 100 } = opts;
  
  exportState.isExporting = true;
  exportState.progress = { current: 0, total: 0, status: 'Getting cached data...' };
  broadcastProgress();
  
  try {
    // Get cached chat IDs
    const cachedChats = await getAllCached();
    const cachedIds = cachedChats.map(c => c.id);
    const cachedMap = Object.fromEntries(cachedChats.map(c => [c.id, c]));
    
    // Inject content script first (in case it's not loaded)
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      files: ['content.js']
    }).catch(() => {}); // Ignore if already injected
    
    await new Promise(r => setTimeout(r, 500)); // Give it time to initialize
    
    // Tell content script to run export, passing cached IDs and scroll settings
    const result = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(sourceTabId, { 
        action: 'RUN_EXPORT', 
        forceRefresh,
        cachedIds: forceRefresh ? [] : cachedIds,
        autoScroll,
        scrollLimit
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!result || result.error) {
      throw new Error(result?.error || 'Export failed');
    }
    
    // Merge newly fetched chats with cached ones
    const allChats = [];
    const newlyFetched = [];
    
    // Add newly fetched (and cache them)
    for (const chat of result.chats) {
      await cacheChat(chat);
      allChats.push(chat);
      newlyFetched.push(chat.id);
    }
    
    // Add cached chats that are still in sidebar
    for (const id of result.allIds || []) {
      if (!newlyFetched.includes(id) && cachedMap[id]) {
        allChats.push(cachedMap[id]);
      }
    }
    
    // Create ZIP
    exportState.progress.status = 'Creating ZIP...';
    broadcastProgress();
    
    const zip = new JSZip();
    const usedNames = new Map(); // Track duplicate filenames
    
    for (const chat of allChats) {
      let baseName = sanitizeFilename(chat.title);
      let fileName = baseName;
      
      // Handle duplicates by appending a number
      if (usedNames.has(baseName)) {
        const count = usedNames.get(baseName) + 1;
        usedNames.set(baseName, count);
        fileName = `${baseName}_${count}`;
      } else {
        usedNames.set(baseName, 1);
      }
      
      if (format === 'json' || format === 'both') {
        zip.file(`${fileName}.json`, JSON.stringify(chat, null, 2));
      }
      if (format === 'md' || format === 'both') {
        zip.file(`${fileName}.md`, toMarkdown(chat));
      }
    }
    
    if (format === 'json' || format === 'both') {
      zip.file('_all_chats.json', JSON.stringify({
        exportedAt: new Date().toISOString(),
        totalChats: allChats.length,
        chats: allChats
      }, null, 2));
    }
    
    const base64 = await zip.generateAsync({ type: 'base64' });
    const dataUrl = 'data:application/zip;base64,' + base64;
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: `gemini-export-${getTimestamp()}.zip`,
      saveAs: true
    });
    
    const fromCache = allChats.length - result.chats.length;
    exportState.progress = { 
      current: allChats.length, 
      total: allChats.length, 
      status: `Done! ${allChats.length} chats (${result.chats.length} fetched, ${fromCache} from cache)` 
    };
    broadcastProgress();
    
  } catch (error) {
    console.error('[Gemini Export]', error);
    exportState.progress.status = `Error: ${error.message}`;
    broadcastProgress();
  } finally {
    exportState.isExporting = false;
    setTimeout(() => {
      exportState.progress = { current: 0, total: 0, status: '' };
    }, 5000);
  }
}

function sanitizeFilename(name) {
  return (name || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 80);
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function toMarkdown(chat) {
  let md = `# ${chat.title}\n\n`;
  if (chat.createdAt) {
    md += `> Created: ${chat.createdAt}\n`;
  }
  md += `> Exported: ${chat.exportedAt}\n> URL: ${chat.url}\n\n---\n\n`;
  for (const msg of chat.messages || []) {
    md += msg.role === 'user' ? `## 👤 User\n\n${msg.content}\n\n` : `## 🤖 Gemini\n\n${msg.content}\n\n`;
    md += `---\n\n`;
  }
  return md;
}

function broadcastProgress() {
  chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', progress: exportState.progress }).catch(() => {});
}
