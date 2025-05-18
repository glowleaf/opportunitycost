document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enableToggle');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = new URL(tab.url).hostname;

  // Load saved state
  const { enabledSites = {} } = await chrome.storage.sync.get('enabledSites');
  toggle.checked = enabledSites[hostname] !== false; // Default to enabled

  // Handle toggle changes
  toggle.addEventListener('change', async () => {
    const { enabledSites = {} } = await chrome.storage.sync.get('enabledSites');
    enabledSites[hostname] = toggle.checked;
    await chrome.storage.sync.set({ enabledSites });
    
    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_STATE_CHANGED',
      enabled: toggle.checked
    });
  });
}); 