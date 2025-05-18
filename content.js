// Bitcoin Opportunity Cost Chrome Extension
// Shows potential future value of purchases if invested in Bitcoin instead

const CAGR = 0.40; // 40% annual growth
const YEARS = 4;
const BATCH_SIZE = 5; // Safe batch size
const PROCESSING_DELAY = 200; // Delay between batches
const MAX_QUEUE_SIZE = 500; // Prevent queue from growing too large

let btcPrices = {};
let isEnabled = true;
let processingQueue = [];
let isProcessing = false;
let observedNodes = new Set();
let intersectionObserver = null;

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
  USD: { symbol: '$', position: 'prefix', code: 'USD' },
  EUR: { symbol: '€', position: 'suffix', code: 'EUR' },
  GBP: { symbol: '£', position: 'prefix', code: 'GBP' },
  JPY: { symbol: '¥', position: 'prefix', code: 'JPY' },
  CAD: { symbol: 'C$', position: 'prefix', code: 'CAD' },
  AUD: { symbol: 'A$', position: 'prefix', code: 'AUD' },
  CHF: { symbol: 'CHF', position: 'prefix', code: 'CHF' },
  CNY: { symbol: 'CN¥', position: 'prefix', code: 'CNY' },
  SEK: { symbol: 'kr', position: 'suffix', code: 'SEK' },
  NZD: { symbol: 'NZ$', position: 'prefix', code: 'NZD' }
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

function processTextNode(node) {
  if (!isEnabled || !node.textContent) return;
  const priceRegex = /([€$£¥]|C\$|A\$|CHF|CN¥|NZ\$|kr)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
  const text = node.textContent;
  if (!priceRegex.test(text)) return;
  priceRegex.lastIndex = 0;
  let newHTML = text;
  let match;
  let replacements = 0;
  const MAX_REPLACEMENTS = 10;
  while ((match = priceRegex.exec(text)) !== null && replacements < MAX_REPLACEMENTS) {
    const [fullMatch, symbol, amount] = match;
    const fiat = parseFloat(amount.replace(/,/g, ''));
    if (!isFinite(fiat) || fiat <= 0) continue;
    const currencyData = getCurrencySymbolAndCode(fullMatch);
    if (!currencyData || !btcPrices[currencyData.code.toLowerCase()]) continue;
    const future = calculateFutureValue(fiat, currencyData.code);
    if (!future) continue;
    const original = `${currencyData.symbol}${fiat.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const tooltipContent = createTooltipHTML(original, future, currencyData.symbol);
    const replacement = `
      <span class="btc-opportunity-cost">
        ${currencyData.symbol}${Number(future).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}*
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
  }
}

function processQueue() {
  if (!isProcessing || processingQueue.length === 0) return;
  const batch = processingQueue.splice(0, BATCH_SIZE);
  batch.forEach(processTextNode);
  if (processingQueue.length > 0) {
    setTimeout(() => processQueue(), PROCESSING_DELAY);
  } else {
    isProcessing = false;
  }
}

function observeVisibleTextNodes(element) {
  if (intersectionObserver) intersectionObserver.disconnect();
  observedNodes.clear();
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && processingQueue.length < MAX_QUEUE_SIZE) {
        if (!observedNodes.has(entry.target)) {
          processingQueue.push(entry.target);
          observedNodes.add(entry.target);
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
            node.parentElement.classList?.contains('btc-opportunity-cost')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let node;
  let count = 0;
  const MAX_NODES = 200;
  while ((node = walker.nextNode()) && count < MAX_NODES) {
    intersectionObserver.observe(node);
    count++;
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
    // Set up mutation observer to handle dynamic content
    const observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;
      try {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                observeVisibleTextNodes(node);
              } else if (node.nodeType === Node.TEXT_NODE) {
                intersectionObserver.observe(node);
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