const cryptoSymbols = [
  { code: "COINBASE:BTCUSD", label: "BTC-USD", quoteSymbol: "BTC-USD", market: "crypto" },
  { code: "COINBASE:ETHUSD", label: "ETH-USD", quoteSymbol: "ETH-USD", market: "crypto" },
  { code: "COINBASE:SOLUSD", label: "SOL-USD", quoteSymbol: "SOL-USD", market: "crypto" },
  { code: "COINBASE:XRPUSD", label: "XRP-USD", quoteSymbol: "XRP-USD", market: "crypto" },
];

const stockSymbols = [
  { code: "NASDAQ:AAPL", label: "AAPL", quoteSymbol: "AAPL", market: "stock" },
  { code: "NASDAQ:MSFT", label: "MSFT", quoteSymbol: "MSFT", market: "stock" },
  { code: "NASDAQ:NVDA", label: "NVDA", quoteSymbol: "NVDA", market: "stock" },
  { code: "NASDAQ:TSLA", label: "TSLA", quoteSymbol: "TSLA", market: "stock" },
  { code: "NASDAQ:AMZN", label: "AMZN", quoteSymbol: "AMZN", market: "stock" },
  { code: "NASDAQ:META", label: "META", quoteSymbol: "META", market: "stock" },
];

const allSymbols = [...cryptoSymbols, ...stockSymbols];
const buttonTemplate = document.getElementById("symbolButtonTemplate");
const listItemTemplate = document.getElementById("listItemTemplate");
const alertPermission = document.getElementById("alertPermission");
const permissionButton = document.getElementById("permissionButton");
const alertForm = document.getElementById("alertForm");
const alertSymbol = document.getElementById("alertSymbol");
const alertDirection = document.getElementById("alertDirection");
const alertPrice = document.getElementById("alertPrice");
const alertList = document.getElementById("alertList");
const priceList = document.getElementById("priceList");

const latestPrices = new Map();
const activeAlerts = [];
let stockTimerId = null;
let cryptoSocket = null;
let stockPollMs = 5000;

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) {
    return "--";
  }

  const amount = Number(value);
  const digits = amount >= 1000 ? 0 : amount >= 1 ? 2 : 4;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(amount);
}

function updatePermissionPill() {
  if (!("Notification" in window)) {
    alertPermission.textContent = "알림 권한: 지원 안 됨";
    permissionButton.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    alertPermission.textContent = "알림 권한: 허용됨";
  } else if (Notification.permission === "denied") {
    alertPermission.textContent = "알림 권한: 차단됨";
  } else {
    alertPermission.textContent = "알림 권한: 확인 전";
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return;
  }

  await Notification.requestPermission();
  updatePermissionPill();
}

function notifyAlert(alert, price) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  new Notification(`${alert.symbol} 알림`, {
    body: `${alert.direction === "above" ? "목표 이상" : "목표 이하"} 도달: ${formatMoney(price)} (설정 ${formatMoney(alert.target)})`,
  });
}

function renderList(container, items, formatter) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "아직 항목이 없습니다.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const fragment = listItemTemplate.content.cloneNode(true);
    const node = fragment.querySelector(".list-item");
    node.innerHTML = formatter(item);
    container.appendChild(fragment);
  });
}

function renderActiveAlerts() {
  renderList(alertList, activeAlerts, (item) => `
    <div class="list-item-row">
      <strong>${item.symbol}</strong>
      <span>${item.direction === "above" ? "이상" : "이하"} ${formatMoney(item.target)}</span>
    </div>
    <div class="list-item-row muted-row">
      <span>${item.triggered ? "발송됨" : "대기 중"}</span>
      <button class="inline-button" data-remove-id="${item.id}">삭제</button>
    </div>
  `);

  Array.from(alertList.querySelectorAll("[data-remove-id]")).forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.removeId);
      const index = activeAlerts.findIndex((item) => item.id === id);
      if (index >= 0) {
        activeAlerts.splice(index, 1);
        renderActiveAlerts();
      }
    });
  });
}

function renderPrices() {
  const items = allSymbols
    .map((item) => ({
      symbol: item.quoteSymbol,
      market: item.market,
      price: latestPrices.get(item.quoteSymbol),
    }))
    .filter((item) => item.price !== undefined);

  renderList(priceList, items, (item) => `
    <div class="list-item-row">
      <strong>${item.symbol}</strong>
      <span>${formatMoney(item.price)}</span>
    </div>
    <div class="list-item-row muted-row">
      <span>${item.market === "crypto" ? "코인" : "주식"}</span>
    </div>
  `);
}

function evaluateAlerts(symbol, price) {
  activeAlerts.forEach((alert) => {
    if (alert.symbol !== symbol || alert.triggered || !Number.isFinite(price)) {
      return;
    }

    const hit = alert.direction === "above" ? price >= alert.target : price <= alert.target;
    if (!hit) {
      return;
    }

    alert.triggered = true;
    notifyAlert(alert, price);
  });

  renderActiveAlerts();
}

function updatePrice(symbol, price) {
  if (!Number.isFinite(price)) {
    return;
  }

  latestPrices.set(symbol, price);
  evaluateAlerts(symbol, price);
  renderPrices();
}

async function refreshStocks() {
  try {
    const response = await fetch(`/api/stocks?symbols=${stockSymbols.map((item) => item.quoteSymbol).join(",")}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    stockPollMs = data.usingAlpacaIex ? 2000 : 5000;
    data.quotes.forEach((quote) => updatePrice(quote.symbol, Number(quote.price)));
  } finally {
    window.clearTimeout(stockTimerId);
    stockTimerId = window.setTimeout(refreshStocks, stockPollMs);
  }
}

function connectCryptoFeed() {
  if (cryptoSocket) {
    cryptoSocket.close();
  }

  cryptoSocket = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  cryptoSocket.addEventListener("open", () => {
    cryptoSocket.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: cryptoSymbols.map((item) => item.quoteSymbol),
        channels: ["ticker"],
      }),
    );
  });

  cryptoSocket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type !== "ticker") {
      return;
    }

    updatePrice(payload.product_id, Number(payload.price));
  });

  cryptoSocket.addEventListener("close", () => {
    window.setTimeout(connectCryptoFeed, 3000);
  });
}

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

function populateAlertSymbols() {
  alertSymbol.innerHTML = "";
  allSymbols.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.quoteSymbol;
    option.textContent = `${item.quoteSymbol} (${item.market === "crypto" ? "코인" : "주식"})`;
    alertSymbol.appendChild(option);
  });
}

function bindAlertForm() {
  alertForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const target = Number(alertPrice.value);
    if (!Number.isFinite(target) || target <= 0) {
      return;
    }

    activeAlerts.unshift({
      id: Date.now(),
      symbol: alertSymbol.value,
      direction: alertDirection.value,
      target,
      triggered: false,
    });

    alertPrice.value = "";
    renderActiveAlerts();
  });
}

permissionButton.addEventListener("click", requestNotificationPermission);

updatePermissionPill();
populateAlertSymbols();
bindAlertForm();
renderActiveAlerts();
renderPrices();
renderSymbolButtons("cryptoButtons", "cryptoChart", cryptoSymbols);
renderSymbolButtons("stockButtons", "stockChart", stockSymbols);
connectCryptoFeed();
refreshStocks();
