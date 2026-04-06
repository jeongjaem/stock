const cryptoSymbols = [
  { code: "COINBASE:BTCUSD", label: "BTC-USD" },
  { code: "COINBASE:ETHUSD", label: "ETH-USD" },
  { code: "COINBASE:SOLUSD", label: "SOL-USD" },
  { code: "COINBASE:XRPUSD", label: "XRP-USD" },
];

const stockSymbols = [
  { code: "NASDAQ:AAPL", label: "AAPL" },
  { code: "NASDAQ:MSFT", label: "MSFT" },
  { code: "NASDAQ:NVDA", label: "NVDA" },
  { code: "NASDAQ:TSLA", label: "TSLA" },
  { code: "NASDAQ:AMZN", label: "AMZN" },
  { code: "NASDAQ:META", label: "META" },
];

const buttonTemplate = document.getElementById("symbolButtonTemplate");

function createAdvancedChart(hostId, symbol) {
  const host = document.getElementById(hostId);
  host.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "tradingview-widget-container";

  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container__widget";
  wrapper.appendChild(widget);

  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.text = JSON.stringify({
    autosize: true,
    symbol,
    interval: "1",
    range: "60m",
    timezone: "Asia/Seoul",
    theme: "dark",
    style: "1",
    locale: "kr",
    allow_symbol_change: false,
    hide_top_toolbar: true,
    hide_side_toolbar: false,
    hide_legend: false,
    save_image: false,
    calendar: false,
    support_host: "https://www.tradingview.com",
    backgroundColor: "rgba(0, 0, 0, 0)",
    gridColor: "rgba(255, 255, 255, 0.06)",
    watchlist: [],
    studies: [],
    withdateranges: true,
    details: false,
    hotlist: false,
  });

  wrapper.appendChild(script);
  host.appendChild(wrapper);
}

function renderSymbolButtons(containerId, hostId, symbols) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  let activeCode = symbols[0].code;

  const updateActive = () => {
    Array.from(container.querySelectorAll(".symbol-chip")).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.symbol === activeCode);
    });
  };

  symbols.forEach((item) => {
    const fragment = buttonTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".symbol-chip");
    button.textContent = item.label;
    button.dataset.symbol = item.code;
    button.addEventListener("click", () => {
      activeCode = item.code;
      updateActive();
      createAdvancedChart(hostId, activeCode);
    });
    container.appendChild(fragment);
  });

  updateActive();
  createAdvancedChart(hostId, activeCode);
}

renderSymbolButtons("cryptoButtons", "cryptoChart", cryptoSymbols);
renderSymbolButtons("stockButtons", "stockChart", stockSymbols);
