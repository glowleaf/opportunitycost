document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enableToggle');
  const cagrInput = document.getElementById('cagrInput');
  const yearsInput = document.getElementById('yearsInput');
  const btcPriceElement = document.querySelector('.btc-price');
  const btcUpdatedElement = document.querySelector('.btc-updated');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = new URL(tab.url).hostname;

  // Load saved state and settings
  const { 
    enabledSites = {}, 
    settings = { cagr: 40, years: 5 }
  } = await chrome.storage.sync.get(['enabledSites', 'settings']);
  
  // Initialize toggle state
  toggle.checked = enabledSites[hostname] !== false; // Default to enabled

  // Initialize settings inputs
  cagrInput.value = settings.cagr;
  yearsInput.value = settings.years;

  // Get and display Bitcoin price
  const { btcPrices } = await chrome.storage.local.get('btcPrices');
  if (btcPrices?.bitcoin?.usd) {
    const price = btcPrices.bitcoin.usd.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
    btcPriceElement.textContent = `BTC: ${price}`;
    
    const lastUpdate = new Date(btcPrices.timestamp);
    btcUpdatedElement.textContent = `Last updated: ${lastUpdate.toLocaleString()}`;
  } else {
    btcPriceElement.textContent = 'BTC price unavailable';
    btcUpdatedElement.textContent = 'Please refresh the page';
  }

  // Handle toggle changes
  toggle.addEventListener('change', async () => {
    enabledSites[hostname] = toggle.checked;
    await chrome.storage.sync.set({ enabledSites });
    
    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_STATE_CHANGED',
      enabled: toggle.checked
    });
  });

  // Handle settings changes
  async function updateSettings() {
    const cagr = parseInt(cagrInput.value, 10);
    const years = parseInt(yearsInput.value, 10);
    
    if (isNaN(cagr) || isNaN(years)) return;
    if (cagr < 1 || cagr > 100) return;
    if (years < 1 || years > 30) return;

    const settings = { cagr, years };
    await chrome.storage.sync.set({ settings });
    
    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'SETTINGS_CHANGED',
      settings
    });
  }

  cagrInput.addEventListener('change', updateSettings);
  yearsInput.addEventListener('change', updateSettings);
}); 