const cryptoSymbols = [
  { code: "COINBASE:BTCUSD", label: "BTC-USD", quoteSymbol: "BTC-USD", market: "crypto" },
  { code: "COINBASE:ETHUSD", label: "ETH-USD", quoteSymbol: "ETH-USD", market: "crypto" },
  { code: "COINBASE:SOLUSD", label: "SOL-USD", quoteSymbol: "SOL-USD", market: "crypto" },
  { code: "COINBASE:XRPUSD", label: "XRP-USD", quoteSymbol: "XRP-USD", market: "crypto" },
];

const stockSymbols = [
  { code: "NASDAQ:AAPL", label: "AAPL", quoteSymbol: "AAPL", market: "stock", name: "Apple" },
  { code: "NASDAQ:MSFT", label: "MSFT", quoteSymbol: "MSFT", market: "stock", name: "Microsoft" },
  { code: "NASDAQ:NVDA", label: "NVDA", quoteSymbol: "NVDA", market: "stock", name: "NVIDIA" },
  { code: "NASDAQ:TSLA", label: "TSLA", quoteSymbol: "TSLA", market: "stock", name: "Tesla" },
  { code: "NASDAQ:AMZN", label: "AMZN", quoteSymbol: "AMZN", market: "stock", name: "Amazon" },
  { code: "NASDAQ:META", label: "META", quoteSymbol: "META", market: "stock", name: "Meta" },
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
const stockFeedStatus = document.getElementById("stockFeedStatus");

const stockSymbolEl = document.getElementById("stockSymbol");
const stockNameEl = document.getElementById("stockName");
const stockPriceEl = document.getElementById("stockPrice");
const stockMetaEl = document.getElementById("stockMeta");
const stockRangeEl = document.getElementById("stockRange");
const stockBarsEl = document.getElementById("stockBars");
const stockGridPath = document.getElementById("stockGrid");
const stockCandlesLayer = document.getElementById("stockCandles");
const stockLinePath = document.getElementById("stockLine");

const latestPrices = new Map();
const stockSnapshots = new Map();
const activeAlerts = [];
let stockTimerId = null;
let cryptoSocket = null;
let stockPollMs = 5000;
let activeStockSymbol = stockSymbols[0].quoteSymbol;

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

function formatChange(change, changePercent) {
  if (!Number.isFinite(Number(change))) {
    return "변동 데이터 없음";
  }

  const sign = Number(change) > 0 ? "+" : "";
  const pct = Number.isFinite(Number(changePercent)) ? ` (${sign}${Number(changePercent).toFixed(2)}%)` : "";
  return `${sign}${Number(change).toFixed(2)}${pct}`;
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

function drawStockChart(symbol) {
  const snapshot = stockSnapshots.get(symbol);
  const fallbackName = stockSymbols.find((item) => item.quoteSymbol === symbol)?.name || symbol;

  if (!snapshot) {
    stockSymbolEl.textContent = symbol;
    stockNameEl.textContent = fallbackName;
    stockPriceEl.textContent = "--";
    stockMetaEl.textContent = "데이터 수집 중";
    stockRangeEl.textContent = "";
    stockBarsEl.textContent = "";
    stockGridPath.setAttribute("d", "");
    stockCandlesLayer.innerHTML = "";
    stockLinePath.setAttribute("d", "");
    return;
  }

  const bars = Array.isArray(snapshot.bars) ? snapshot.bars.filter((bar) =>
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close)
  ) : [];

  stockSymbolEl.textContent = snapshot.symbol;
  stockNameEl.textContent = snapshot.name || fallbackName;
  stockPriceEl.textContent = formatMoney(snapshot.price);
  stockMetaEl.textContent = `${snapshot.marketState} · ${formatChange(snapshot.change, snapshot.changePercent)}`;

  if (!bars.length) {
    stockRangeEl.textContent = "최근 분봉 데이터 없음";
    stockBarsEl.textContent = "";
    stockGridPath.setAttribute("d", "");
    stockCandlesLayer.innerHTML = "";
    stockLinePath.setAttribute("d", "");
    return;
  }

  const width = 900;
  const height = 360;
  const top = 16;
  const bottom = 320;
  const chartHeight = bottom - top;
  const max = Math.max(...bars.map((bar) => bar.high));
  const min = Math.min(...bars.map((bar) => bar.low));
  const scale = (value) => {
    const range = max - min || Math.max(Math.abs(max), 1);
    return top + (1 - (value - min) / range) * chartHeight;
  };

  stockGridPath.setAttribute("d", `M 0 80 L ${width} 80 M 0 160 L ${width} 160 M 0 240 L ${width} 240`);
  stockCandlesLayer.innerHTML = "";

  const step = width / bars.length;
  const candleWidth = Math.max(10, step - 8);
  const linePoints = [];

  bars.forEach((bar, index) => {
    const x = index * step + step / 2;
    const openY = scale(bar.open);
    const closeY = scale(bar.close);
    const highY = scale(bar.high);
    const lowY = scale(bar.low);
    const rising = bar.close >= bar.open;

    const wick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    wick.setAttribute("x1", x.toFixed(2));
    wick.setAttribute("x2", x.toFixed(2));
    wick.setAttribute("y1", highY.toFixed(2));
    wick.setAttribute("y2", lowY.toFixed(2));
    wick.setAttribute("class", `candle-wick ${rising ? "up" : "down"}`);

    const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    body.setAttribute("x", (x - candleWidth / 2).toFixed(2));
    body.setAttribute("width", candleWidth.toFixed(2));
    body.setAttribute("y", Math.min(openY, closeY).toFixed(2));
    body.setAttribute("height", Math.max(Math.abs(closeY - openY), 2).toFixed(2));
    body.setAttribute("rx", "2");
    body.setAttribute("class", `candle-body ${rising ? "up" : "down"}`);

    stockCandlesLayer.appendChild(wick);
    stockCandlesLayer.appendChild(body);
    linePoints.push(`${x.toFixed(2)} ${closeY.toFixed(2)}`);
  });

  stockLinePath.setAttribute("d", `M ${linePoints.join(" L ")}`);
  stockRangeEl.textContent = `${formatMoney(min)} - ${formatMoney(max)}`;
  stockBarsEl.textContent = `${bars.length}개 1분봉`;
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
    stockFeedStatus.textContent = data.usingAlpacaIex ? "주식: Alpaca IEX 실시간" : "주식: 공개 피드 대체";

    data.quotes.forEach((quote) => {
      updatePrice(quote.symbol, Number(quote.price));
      stockSnapshots.set(quote.symbol, quote);
    });

    drawStockChart(activeStockSymbol);
  } catch (error) {
    stockFeedStatus.textContent = "주식: 데이터 갱신 실패";
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

function renderSymbolButtons(containerId, hostId, symbols, onSelect) {
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
      if (hostId) {
        createAdvancedChart(hostId, activeCode);
      }
      if (onSelect) {
        onSelect(item);
      }
    });
    container.appendChild(fragment);
  });

  updateActive();
  if (hostId) {
    createAdvancedChart(hostId, activeCode);
  }
  if (onSelect) {
    onSelect(symbols[0]);
  }
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
renderSymbolButtons("stockButtons", null, stockSymbols, (item) => {
  activeStockSymbol = item.quoteSymbol;
  drawStockChart(activeStockSymbol);
});
connectCryptoFeed();
refreshStocks();
