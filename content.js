// Bitcoin Opportunity Cost Chrome Extension
// Shows potential future value of purchases if invested in Bitcoin instead

const CAGR = 0.40; // 40% annual growth
const YEARS = 4;
const BATCH_SIZE = 5; // Safe batch size
const PROCESSING_DELAY = 200; // Delay between batches
const MAX_QUEUE_SIZE = 500; // Prevent queue from growing too large

const MIN_PROCESSING_DELAY = 50;  // Minimum delay in ms
const MAX_PROCESSING_DELAY = 500; // Maximum delay in ms
const PERFORMANCE_THRESHOLD = 100; // Frame time threshold in ms
let currentProcessingDelay = 200;  // Start with default delay

let btcPrices = {};
let isEnabled = true;
let processingQueue = [];
let isProcessing = false;
let observedNodes = new Set();
let intersectionObserver = null;

// Cache for processed text content to prevent re-processing
const processedCache = new Map();

// Get prices from chrome.storage
async function getBTCPrices() {
  try {
    const { btcPrices: storedPrices } = await chrome.storage.local.get('btcPrices');
    if (!storedPrices?.bitcoin) return false;
    const requiredCurrencies = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 'sek', 'nzd'];
    const hasAllPrices = requiredCurrencies.every(currency => typeof storedPrices.bitcoin[currency] === 'number' && storedPrices.bitcoin[currency] > 0);
    if (!hasAllPrices) return false;
    btcPrices = storedPrices.bitcoin;
    return true;
  } catch (error) {
    console.error('Failed to get Bitcoin prices:', error);
    return false;
  }
}

function calculateFutureValue(fiatAmount, currency) {
  const btcPrice = btcPrices[currency.toLowerCase()];
  if (!btcPrice || !isFinite(btcPrice) || btcPrice <= 0) return null;
  const btcAmount = fiatAmount / btcPrice;
  if (!isFinite(btcAmount)) return null;
  const futureBTCPrice = btcPrice * Math.pow(1 + CAGR, YEARS);
  if (!isFinite(futureBTCPrice)) return null;
  return (btcAmount * futureBTCPrice).toFixed(2);
}

const CURRENCY_PATTERNS = {
  USD: { symbol: '$', position: 'prefix', code: 'USD', textCode: 'USD' },
  EUR: { symbol: '€', position: 'suffix', code: 'EUR', textCode: 'EUR' },
  GBP: { symbol: '£', position: 'prefix', code: 'GBP', textCode: 'GBP' },
  JPY: { symbol: '¥', position: 'prefix', code: 'JPY', textCode: 'JPY' },
  CAD: { symbol: 'C$', position: 'prefix', code: 'CAD', textCode: 'CAD' },
  AUD: { symbol: 'A$', position: 'prefix', code: 'AUD', textCode: 'AUD' },
  CHF: { symbol: 'CHF', position: 'prefix', code: 'CHF', textCode: 'CHF' },
  CNY: { symbol: 'CN¥', position: 'prefix', code: 'CNY', textCode: 'CNY' },
  SEK: { symbol: 'kr', position: 'suffix', code: 'SEK', textCode: 'SEK' },
  NZD: { symbol: 'NZ$', position: 'prefix', code: 'NZD', textCode: 'NZD' }
};

function getCurrencySymbolAndCode(text) {
  for (const [key, pattern] of Object.entries(CURRENCY_PATTERNS)) {
    if (text.includes(pattern.symbol)) {
      return { symbol: pattern.symbol, code: key };
    }
  }
  return null;
}

function createTooltipHTML(originalPrice, futureValue, currencySymbol) {
  return `
    <div class="btc-opportunity-tooltip">
      <div class="tooltip-header">Bitcoin Opportunity Cost</div>
      <div class="tooltip-content">
        <div>Original Price: ${originalPrice}</div>
        <div>Potential Future Value: ${currencySymbol}${Number(futureValue).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        <div class="tooltip-footer">Based on ${CAGR * 100}% CAGR over ${YEARS} years</div>
      </div>
    </div>
  `;
}

function updateProcessingDelay() {
  if (!window.performance || !window.performance.now) return;
  
  const start = performance.now();
  requestAnimationFrame(() => {
    const frameTime = performance.now() - start;
    
    // Adjust delay based on frame time
    if (frameTime > PERFORMANCE_THRESHOLD) {
      // Page is struggling, increase delay
      currentProcessingDelay = Math.min(currentProcessingDelay * 1.5, MAX_PROCESSING_DELAY);
    } else {
      // Page is performing well, decrease delay
      currentProcessingDelay = Math.max(currentProcessingDelay * 0.8, MIN_PROCESSING_DELAY);
    }
  });
}

function processTextNode(node) {
  if (!isEnabled || !node.textContent) return;
  
  // Check cache first
  const cacheKey = node.textContent.trim();
  if (processedCache.has(cacheKey)) {
    const cachedResult = processedCache.get(cacheKey);
    if (cachedResult) {
      const span = document.createElement('span');
      span.innerHTML = cachedResult;
      node.parentNode.replaceChild(span, node);
    }
    return;
  }

  // Enhanced regex to handle more number formats and currency codes
  const priceRegex = /(?:([€$£¥]|C\$|A\$|CHF|CN¥|NZ\$|kr|USD|EUR|GBP|JPY|CAD|AUD|CNY|SEK|NZD)\s*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)\s*([€$£¥]|C\$|A\$|CHF|CN¥|NZ\$|kr|USD|EUR|GBP|JPY|CAD|AUD|CNY|SEK|NZD))/g;
  const text = node.textContent;
  if (!priceRegex.test(text)) return;
  priceRegex.lastIndex = 0;
  let newHTML = text;
  let match;
  let replacements = 0;
  const MAX_REPLACEMENTS = 10;
  while ((match = priceRegex.exec(text)) !== null && replacements < MAX_REPLACEMENTS) {
    const [fullMatch, symbolBefore, amountBefore, amountAfter, symbolAfter] = match;
    const symbol = symbolBefore || symbolAfter;
    const amount = (amountBefore || amountAfter).replace(/\s/g, '').replace(',', '.');
    const fiat = parseFloat(amount);
    if (!isFinite(fiat) || fiat <= 0) continue;
    
    let currencyData;
    // Check for text codes first (USD, EUR, etc.)
    for (const [key, pattern] of Object.entries(CURRENCY_PATTERNS)) {
      if (symbol === pattern.textCode) {
        currencyData = { symbol: pattern.symbol, code: key };
        break;
      }
    }
    // If no text code found, check for symbols
    if (!currencyData) {
      currencyData = getCurrencySymbolAndCode(symbol);
    }
    
    if (!currencyData || !btcPrices[currencyData.code.toLowerCase()]) continue;
    const future = calculateFutureValue(fiat, currencyData.code);
    if (!future) continue;

    const btcAmount = (fiat / btcPrices[currencyData.code.toLowerCase()]).toFixed(8);
    const currentBTCPrice = btcPrices[currencyData.code.toLowerCase()].toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const original = `${amount} ${currencyData.symbol}`.trim();
    const tooltipContent = `
      <div class="btc-opportunity-tooltip">
        <div class="tooltip-header">Bitcoin Opportunity Cost</div>
        <div class="tooltip-content">
          <div class="price-row">
            <span class="label">Current Price:</span>
            <span class="value">${original}</span>
          </div>
          <div class="price-row">
            <span class="label">BTC Equivalent:</span>
            <span class="value">₿${btcAmount}</span>
          </div>
          <div class="price-row highlight">
            <span class="label">Future Value:</span>
            <span class="value">${currencyData.symbol}${Number(future).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}</span>
          </div>
          <div class="tooltip-footer">
            <div>Based on ${CAGR * 100}% CAGR over ${YEARS} years</div>
            <div class="disclaimer">Past performance does not guarantee future results</div>
          </div>
        </div>
      </div>
    `;
    
    const replacement = `
      <span class="btc-opportunity-cost">
        ${currencyData.symbol}${Number(future).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}
        ${tooltipContent}
      </span>
    `;
    newHTML = newHTML.replace(fullMatch, replacement);
    replacements++;
  }
  if (newHTML !== text) {
    const span = document.createElement('span');
    span.innerHTML = newHTML;
    node.parentNode.replaceChild(span, node);
    // Cache the result
    processedCache.set(cacheKey, newHTML);
    
    // Limit cache size to prevent memory issues
    if (processedCache.size > 1000) {
      const firstKey = processedCache.keys().next().value;
      processedCache.delete(firstKey);
    }
  } else {
    // Cache negative result
    processedCache.set(cacheKey, null);
  }
}

function processQueue() {
  if (!isProcessing || processingQueue.length === 0) return;
  
  updateProcessingDelay();
  const batch = processingQueue.splice(0, BATCH_SIZE);
  batch.forEach(processTextNode);
  
  if (processingQueue.length > 0) {
    setTimeout(() => processQueue(), currentProcessingDelay);
  } else {
    isProcessing = false;
  }
}

function wrapTextNode(node) {
  if (node.parentNode && !observedNodes.has(node)) {
    const wrapper = document.createElement('span');
    wrapper.className = 'btc-price-wrapper';
    wrapper.setAttribute('data-original-text', node.textContent);
    node.parentNode.insertBefore(wrapper, node);
    wrapper.appendChild(node);
    return wrapper;
  }
  return null;
}

function observeVisibleTextNodes(element) {
  if (intersectionObserver) intersectionObserver.disconnect();
  observedNodes.clear();
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && processingQueue.length < MAX_QUEUE_SIZE) {
        const textNode = entry.target.childNodes[0];
        if (textNode && !observedNodes.has(textNode)) {
          processingQueue.push(textNode);
          observedNodes.add(textNode);
        }
        if (!isProcessing) {
          isProcessing = true;
          setTimeout(() => processQueue(), PROCESSING_DELAY);
        }
      }
    });
  }, { root: null, rootMargin: '0px', threshold: 0.1 });

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.tagName?.match(/^(SCRIPT|STYLE|NOSCRIPT)$/i) ||
            node.parentElement.classList?.contains('btc-opportunity-cost') ||
            node.parentElement.classList?.contains('btc-price-wrapper')) {
          return NodeFilter.FILTER_REJECT;
        }
        const priceRegex = /(?:([€$£¥]|C\$|A\$|CHF|CN¥|NZ\$|kr|USD|EUR|GBP|JPY|CAD|AUD|CNY|SEK|NZD)\s*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?)\s*([€$£¥]|C\$|A\$|CHF|CN¥|NZ\$|kr|USD|EUR|GBP|JPY|CAD|AUD|CNY|SEK|NZD))/;
        return priceRegex.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node;
  let count = 0;
  const MAX_NODES = 200;
  while ((node = walker.nextNode()) && count < MAX_NODES) {
    const wrapper = wrapTextNode(node);
    if (wrapper) {
      intersectionObserver.observe(wrapper);
      count++;
    }
  }
}

// Handle extension state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'TOGGLE_STATE_CHANGED') {
      isEnabled = message.enabled;
      if (isEnabled) {
        observeVisibleTextNodes(document.body);
      }
    } else if (message.type === 'INIT_STATE') {
      isEnabled = message.enabled;
      if (isEnabled) {
        init();
      }
    } else if (message.type === 'SETTINGS_CHANGED') {
      // Update CAGR and YEARS settings
      CAGR = message.settings.cagr / 100; // Convert percentage to decimal
      YEARS = message.settings.years;
      
      // Re-process all visible nodes with new settings
      if (isEnabled) {
        processedCache.clear(); // Clear cache to force re-processing
        observeVisibleTextNodes(document.body);
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Initialize and run the plugin
async function init() {
  try {
    const pricesLoaded = await getBTCPrices();
    if (!pricesLoaded) return;
    observeVisibleTextNodes(document.body);
    
    const observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;
      try {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                observeVisibleTextNodes(node);
              } else if (node.nodeType === Node.TEXT_NODE && 
                        !node.parentElement?.classList?.contains('btc-opportunity-cost') &&
                        !node.parentElement?.classList?.contains('btc-price-wrapper')) {
                const wrapper = wrapTextNode(node);
                if (wrapper) {
                  intersectionObserver.observe(wrapper);
                }
              }
            });
          }
        });
      } catch (error) {
        console.error('Error in mutation observer:', error);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } catch (error) {
    console.error('Error in init:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 