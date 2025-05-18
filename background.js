// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage with empty enabled sites object and fetch initial prices
  chrome.storage.sync.set({ enabledSites: {} });
  fetchAndStorePrices();
});

// Fetch and store Bitcoin prices
async function fetchAndStorePrices(retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp,jpy,cad,aud,chf,cny,sek,nzd');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Validate the response data
    if (!data?.bitcoin) {
      throw new Error('Invalid response format');
    }
    
    const requiredCurrencies = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 'sek', 'nzd'];
    const hasAllPrices = requiredCurrencies.every(currency => 
      typeof data.bitcoin[currency] === 'number' && 
      data.bitcoin[currency] > 0
    );
    
    if (!hasAllPrices) {
      throw new Error('Missing or invalid price data');
    }
    
    const prices = {
      bitcoin: data.bitcoin,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ btcPrices: prices });
    console.log('Successfully updated Bitcoin prices');
    
  } catch (error) {
    console.error('Failed to fetch Bitcoin prices:', error);
    
    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying price fetch (${retryCount + 1}/${MAX_RETRIES})...`);
      setTimeout(() => fetchAndStorePrices(retryCount + 1), RETRY_DELAY);
    } else {
      console.error('Max retries reached, will try again on next scheduled update');
    }
  }
}

// Check and update prices once per day
function schedulePriceUpdate() {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  // Initial fetch
  fetchAndStorePrices();
  
  // Schedule daily updates
  setInterval(() => {
    fetchAndStorePrices();
  }, ONE_DAY);
}

// Start price update schedule
schedulePriceUpdate();

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const hostname = new URL(tab.url).hostname;
      
      // Check if site is enabled
      chrome.storage.sync.get('enabledSites', ({ enabledSites = {} }) => {
        const isEnabled = enabledSites[hostname] !== false; // Default to enabled
        
        // Notify content script of current state
        chrome.tabs.sendMessage(tabId, {
          type: 'INIT_STATE',
          enabled: isEnabled
        }).catch(error => {
          // Ignore errors from tabs that don't have our content script
          if (!error.message.includes('Could not establish connection')) {
            console.error('Error sending message to tab:', error);
          }
        });
      });
    } catch (error) {
      console.error('Error processing tab update:', error);
    }
  }
}); 