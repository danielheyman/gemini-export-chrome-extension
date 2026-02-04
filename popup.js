// Popup script

const exportBtn = document.getElementById('exportBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const formatSelect = document.getElementById('format');
const forceRefreshCheckbox = document.getElementById('forceRefresh');
const autoScrollCheckbox = document.getElementById('autoScroll');
const scrollLimitGroup = document.getElementById('scrollLimitGroup');
const scrollLimitInput = document.getElementById('scrollLimit');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const cacheInfo = document.getElementById('cacheInfo');

// Load saved preferences
chrome.storage.local.get(['exportFormat', 'autoScroll', 'scrollLimit'], (result) => {
  if (result.exportFormat) formatSelect.value = result.exportFormat;
  if (result.autoScroll) {
    autoScrollCheckbox.checked = true;
    scrollLimitGroup.style.display = 'block';
  }
  if (result.scrollLimit) scrollLimitInput.value = result.scrollLimit;
});

// Save format preference
formatSelect.addEventListener('change', () => {
  chrome.storage.local.set({ exportFormat: formatSelect.value });
});

// Toggle scroll limit visibility
autoScrollCheckbox.addEventListener('change', () => {
  scrollLimitGroup.style.display = autoScrollCheckbox.checked ? 'block' : 'none';
  chrome.storage.local.set({ autoScroll: autoScrollCheckbox.checked });
});

// Save scroll limit
scrollLimitInput.addEventListener('change', () => {
  chrome.storage.local.set({ scrollLimit: parseInt(scrollLimitInput.value) || 100 });
});

// Load cache stats
function loadCacheStats() {
  chrome.runtime.sendMessage({ action: 'GET_CACHE_STATS' }, (response) => {
    if (response?.count !== undefined) {
      cacheInfo.textContent = `📦 ${response.count} chats cached locally`;
    }
  });
}

loadCacheStats();

// Export button
exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting...';
  statusDiv.classList.add('visible');
  statusText.textContent = 'Starting...';
  progressBar.style.width = '0%';
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes('gemini.google.com')) {
    statusText.textContent = 'Please open gemini.google.com first';
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export All Chats';
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'START_EXPORT',
    format: formatSelect.value,
    tabId: tab.id,
    forceRefresh: forceRefreshCheckbox.checked,
    autoScroll: autoScrollCheckbox.checked,
    scrollLimit: parseInt(scrollLimitInput.value) || 100
  });
});

// Clear cache button
clearCacheBtn.addEventListener('click', () => {
  if (confirm('Clear all cached chats? Next export will fetch everything fresh.')) {
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' }, () => {
      cacheInfo.textContent = '📦 0 chats cached locally';
    });
  }
});

// Listen for progress and cache updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PROGRESS_UPDATE') {
    const { current, total, status } = msg.progress;
    statusText.textContent = status;
    
    if (total > 0) {
      progressBar.style.width = `${(current / total) * 100}%`;
    }
    
    if (status?.startsWith('Done!') || status?.startsWith('Error')) {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export All Chats';
      progressBar.style.width = status.startsWith('Done!') ? '100%' : '0%';
      loadCacheStats(); // Refresh cache count
    }
  }
  
  if (msg.type === 'CACHE_UPDATE') {
    cacheInfo.textContent = `📦 ${msg.count} chats cached locally`;
  }
});
