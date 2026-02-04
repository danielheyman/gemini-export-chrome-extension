// Popup script

const exportBtn = document.getElementById('exportBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const formatSelect = document.getElementById('format');
const forceRefreshCheckbox = document.getElementById('forceRefresh');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const cacheInfo = document.getElementById('cacheInfo');

// Load saved format preference
chrome.storage.local.get(['exportFormat'], (result) => {
  if (result.exportFormat) {
    formatSelect.value = result.exportFormat;
  }
});

// Save format preference
formatSelect.addEventListener('change', () => {
  chrome.storage.local.set({ exportFormat: formatSelect.value });
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
    forceRefresh: forceRefreshCheckbox.checked
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

// Listen for progress updates
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
});
