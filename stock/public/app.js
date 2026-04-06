const cryptoSymbols = [
  { code: "COINBASE:BTCUSD", symbol: "BTC-USD", name: "Bitcoin", market: "CRYPTO" },
  { code: "COINBASE:ETHUSD", symbol: "ETH-USD", name: "Ethereum", market: "CRYPTO" },
  { code: "COINBASE:SOLUSD", symbol: "SOL-USD", name: "Solana", market: "CRYPTO" },
  { code: "COINBASE:XRPUSD", symbol: "XRP-USD", name: "XRP", market: "CRYPTO" },
];

const stockSymbols = [
  { code: "NASDAQ:AAPL", symbol: "AAPL", name: "Apple", market: "STOCK" },
  { code: "NASDAQ:MSFT", symbol: "MSFT", name: "Microsoft", market: "STOCK" },
  { code: "NASDAQ:NVDA", symbol: "NVDA", name: "NVIDIA", market: "STOCK" },
  { code: "NASDAQ:TSLA", symbol: "TSLA", name: "Tesla", market: "STOCK" },
  { code: "NASDAQ:AMZN", symbol: "AMZN", name: "Amazon", market: "STOCK" },
  { code: "NASDAQ:META", symbol: "META", name: "Meta", market: "STOCK" },
];

const cryptoGrid = document.getElementById("cryptoGrid");
const stockGrid = document.getElementById("stockGrid");
const cardTemplate = document.getElementById("widgetCardTemplate");

function createWidgetCard(container, item) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".widget-card");
  card.querySelector(".symbol").textContent = item.symbol;
  card.querySelector(".name").textContent = item.name;
  card.querySelector(".market-tag").textContent = item.market;

  const host = fragment.querySelector(".widget-host");
  const widgetRoot = document.createElement("div");
  widgetRoot.className = "tradingview-widget-container__widget";
  host.appendChild(widgetRoot);

  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
  script.async = true;
  script.text = JSON.stringify({
    symbol: item.code,
    width: "100%",
    height: 220,
    locale: "kr",
    dateRange: "1D",
    colorTheme: "dark",
    isTransparent: true,
    autosize: true,
    largeChartUrl: "",
    chartOnly: false,
    noTimeScale: false,
    trendLineColor: "rgba(66, 212, 197, 1)",
    underLineColor: "rgba(66, 212, 197, 0.16)",
    underLineBottomColor: "rgba(66, 212, 197, 0.02)",
    lineWidth: 2,
  });
  host.appendChild(script);

  container.appendChild(fragment);
}

function renderWidgets() {
  cryptoSymbols.forEach((item) => createWidgetCard(cryptoGrid, item));
  stockSymbols.forEach((item) => createWidgetCard(stockGrid, item));
}

renderWidgets();
