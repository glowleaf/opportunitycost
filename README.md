# Bitcoin Opportunity Cost Chrome Extension

A Chrome extension that shows the opportunity cost of purchases in terms of potential Bitcoin value. When browsing websites, it automatically converts price amounts to their potential future value if that money was invested in Bitcoin instead.

## Features

- Automatically detects prices in multiple currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SEK, NZD)
- Shows potential future value based on a 40% compound annual growth rate (CAGR) over 4 years
- Hover over converted prices to see the original amount
- Real-time Bitcoin price data from CoinGecko API
- Lazy loading for better performance
- Handles dynamic content updates
- Beautiful tooltips with detailed information

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the folder containing this extension

## Usage

Once installed, the extension will automatically:
- Replace prices on web pages with potential future Bitcoin values
- Mark converted prices in Bitcoin orange
- Show an asterisk (*) next to converted prices
- Display detailed information when hovering over converted prices

## Configuration

The extension uses the following default settings (can be modified in `content.js`):
- CAGR (Compound Annual Growth Rate): 40%
- Time period: 4 years
- Price updates: Once per day

## Technical Details

- Uses the CoinGecko API for real-time Bitcoin prices
- Implements local storage caching to minimize API calls
- Uses IntersectionObserver for lazy loading
- Supports multiple currency formats and symbols
- Optimized for performance with batch processing

## License

MIT License - feel free to modify and distribute as needed.

## Disclaimer

This extension is for educational purposes only. The projected future values are based on hypothetical growth rates and should not be considered as financial advice. Past performance does not guarantee future results. 