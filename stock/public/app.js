const cryptoProducts = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "SOL-USD", name: "Solana" },
  { symbol: "XRP-USD", name: "XRP" },
];

const stockSymbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"];
const cryptoGranularity = 60;
const stockPollMs = 5000;
const cryptoCandlePollMs = 15000;
const maxHistoryPoints = 24;
const historyBySymbol = new Map();
const cryptoGrid = document.getElementById("cryptoGrid");
const stockGrid = document.getElementById("stockGrid");
const cryptoStatus = document.getElementById("cryptoStatus");
const stockStatus = document.getElementById("stockStatus");
const cardTemplate = document.getElementById("cardTemplate");

let stockRefreshInFlight = false;
let stockTimerId = null;
let cryptoCandleTimerId = null;
const cryptoCandlesBySymbol = new Map();
const liveCryptoStateBySymbol = new Map();

function text(value) {
  return value;
}

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  const amount = Number(value);
  const digits = amount >= 1000 ? 0 : amount >= 1 ? 2 : 4;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
  }).format(amount);
}

function formatChange(change, changePercent) {
  if (change === null || change === undefined || Number.isNaN(Number(change))) {
    return "\uBCC0\uB3D9 \uB370\uC774\uD130 \uC5C6\uC74C";
  }

  const sign = Number(change) > 0 ? "+" : "";
  const pct = changePercent === null || changePercent === undefined || Number.isNaN(Number(changePercent))
    ? ""
    : ` (${sign}${Number(changePercent).toFixed(2)}%)`;
  return `${sign}${Number(change).toFixed(2)}${pct}`;
}

function getCandleStart(timeMs, granularitySeconds) {
  const bucketMs = granularitySeconds * 1000;
  return Math.floor(timeMs / bucketMs) * bucketMs;
}

function mergeLiveTickIntoCandles(symbol, price, timeMs, granularitySeconds) {
  if (!Number.isFinite(price)) {
    return cryptoCandlesBySymbol.get(symbol) || [];
  }

  const baseCandles = (cryptoCandlesBySymbol.get(symbol) || []).map((candle) => ({ ...candle }));
  const candleStartMs = getCandleStart(timeMs, granularitySeconds);
  const candleStartSeconds = Math.floor(candleStartMs / 1000);
  const lastBase = baseCandles[baseCandles.length - 1];

  if (!lastBase || lastBase.time < candleStartSeconds) {
    const open = lastBase ? lastBase.close : price;
    baseCandles.push({
      time: candleStartSeconds,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume: null,
    });
  }

  const liveIndex = baseCandles.findIndex((candle) => candle.time === candleStartSeconds);
  if (liveIndex >= 0) {
    const candle = baseCandles[liveIndex];
    const state = liveCryptoStateBySymbol.get(symbol);
    const open = state && state.bucketStartMs === candleStartMs
      ? state.open
      : candle.open ?? candle.close ?? price;

    candle.open = open;
    candle.high = Math.max(candle.high ?? price, price, open);
    candle.low = Math.min(candle.low ?? price, price, open);
    candle.close = price;

    liveCryptoStateBySymbol.set(symbol, {
      bucketStartMs: candleStartMs,
      open,
    });
  }

  return baseCandles.slice(-maxHistoryPoints);
}

function pushHistoryPoint(key, value) {
  if (!Number.isFinite(value)) {
    return historyBySymbol.get(key) || [];
  }

  const points = historyBySymbol.get(key) || [];
  points.push(value);

  while (points.length > maxHistoryPoints) {
    points.shift();
  }

  historyBySymbol.set(key, points);
  return points;
}

function buildSparkline(points) {
  if (!points.length) {
    return { line: "", area: "" };
  }

  if (points.length === 1) {
    const y = 24;
    return {
      line: `M 0 ${y} L 160 ${y}`,
      area: `M 0 48 L 0 ${y} L 160 ${y} L 160 48 Z`,
    };
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || Math.max(Math.abs(max), 1);

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 160;
    const normalized = range === 0 ? 0.5 : (point - min) / range;
    const y = 42 - normalized * 34;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L 160 48 L 0 48 Z`;
  return { line, area };
}

function buildGridPath() {
  return "M 0 12 L 160 12 M 0 24 L 160 24 M 0 36 L 160 36";
}

function renderFallbackSparkline(card, points, direction) {
  const line = card.querySelector(".sparkline-line");
  const area = card.querySelector(".sparkline-area");
  const layer = card.querySelector(".candle-layer");
  const grid = card.querySelector(".sparkline-grid");
  const label = card.querySelector(".chart-label");
  const range = card.querySelector(".chart-range");
  const paths = buildSparkline(points);

  grid.setAttribute("d", buildGridPath());
  line.setAttribute("d", paths.line);
  area.setAttribute("d", paths.area);
  layer.innerHTML = "";
  line.classList.remove("up", "down", "is-hidden");
  area.classList.remove("up", "down", "is-hidden");

  if (direction === "up") {
    line.classList.add("up");
    area.classList.add("up");
  } else if (direction === "down") {
    line.classList.add("down");
    area.classList.add("down");
  }

  label.textContent = points.length > 1 ? `\uCD5C\uADFC ${points.length}\uD2F1` : "\uB370\uC774\uD130 \uC218\uC9D1 \uC911";
  range.textContent = points.length
    ? `${formatMoney(Math.min(...points))} - ${formatMoney(Math.max(...points))}`
    : "";
}

function renderCandles(card, candles, granularitySeconds) {
  const line = card.querySelector(".sparkline-line");
  const area = card.querySelector(".sparkline-area");
  const layer = card.querySelector(".candle-layer");
  const grid = card.querySelector(".sparkline-grid");
  const label = card.querySelector(".chart-label");
  const range = card.querySelector(".chart-range");

  line.setAttribute("d", "");
  area.setAttribute("d", "");
  line.classList.add("is-hidden");
  area.classList.add("is-hidden");
  grid.setAttribute("d", buildGridPath());
  layer.innerHTML = "";

  if (!candles.length) {
    label.textContent = "\uBD84\uBD09 \uC5C6\uC74C";
    range.textContent = "";
    return;
  }

  const max = Math.max(...candles.map((candle) => candle.high));
  const min = Math.min(...candles.map((candle) => candle.low));
  const chartHeight = 40;
  const topPadding = 4;
  const width = 160;
  const candleWidth = Math.max(3, width / candles.length - 1.6);
  const step = width / candles.length;
  const scale = (value) => {
    const rangeValue = max - min || Math.max(Math.abs(max), 1);
    const normalized = rangeValue === 0 ? 0.5 : (value - min) / rangeValue;
    return topPadding + (1 - normalized) * chartHeight;
  };

  candles.forEach((candle, index) => {
    const x = index * step + step / 2;
    const openY = scale(candle.open);
    const closeY = scale(candle.close);
    const highY = scale(candle.high);
    const lowY = scale(candle.low);
    const rising = candle.close >= candle.open;

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
    body.setAttribute("height", Math.max(Math.abs(closeY - openY), 1.5).toFixed(2));
    body.setAttribute("rx", "1.5");
    body.setAttribute("class", `candle-body ${rising ? "up" : "down"}`);

    layer.appendChild(wick);
    layer.appendChild(body);
  });

  label.textContent = `${candles.length}\uAC1C ${Math.round(granularitySeconds / 60)}\uBD84\uBD09`;
  range.textContent = `${formatMoney(min)} - ${formatMoney(max)}`;
}

function flashCard(card, direction) {
  card.classList.remove("flash-up", "flash-down");

  if (direction === "up") {
    card.classList.add("flash-up");
  } else if (direction === "down") {
    card.classList.add("flash-down");
  }
}

function upsertCard(container, key, payload) {
  let card = container.querySelector(`[data-key="${key}"]`);
  if (!card) {
    const fragment = cardTemplate.content.cloneNode(true);
    const nextCard = fragment.querySelector(".card");
    nextCard.dataset.key = key;
    container.appendChild(fragment);
    card = container.querySelector(`[data-key="${key}"]`);
  }

  const priceEl = card.querySelector(".price");
  const previousText = priceEl.textContent;
  const nextText = formatMoney(payload.price, payload.currency);

  card.querySelector(".symbol").textContent = payload.symbol;
  card.querySelector(".name").textContent = payload.name;
  card.querySelector(".market-tag").textContent = payload.market;
  priceEl.textContent = nextText;

  const meta = card.querySelector(".meta");
  meta.textContent = payload.meta;
  meta.classList.remove("up", "down");

  if (payload.direction === "up") {
    meta.classList.add("up");
  } else if (payload.direction === "down") {
    meta.classList.add("down");
  }

  if (payload.candles && payload.candles.length) {
    renderCandles(card, payload.candles, payload.granularity || cryptoGranularity);
  } else {
    const points = pushHistoryPoint(key, Number(payload.price));
    renderFallbackSparkline(card, points, payload.direction);
  }

  if (previousText && previousText !== nextText) {
    flashCard(card, payload.direction);
  }
}

async function refreshCryptoCandles() {
  try {
    const products = cryptoProducts.map((item) => item.symbol).join(",");
    const response = await fetch(`/api/crypto?products=${products}&granularity=${cryptoGranularity}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    data.products.forEach((item) => {
      cryptoCandlesBySymbol.set(item.productId, item.candles || []);
      const candles = item.candles || [];
      const latest = candles[candles.length - 1];
      if (latest) {
        liveCryptoStateBySymbol.set(item.productId, {
          bucketStartMs: latest.time * 1000,
          open: latest.open,
        });
      }
    });

    cryptoStatus.textContent = `\uCF54\uC778: 1\uBD84\uBD09 ${new Date().toLocaleTimeString("ko-KR")} \uAC31\uC2E0`;
  } catch (error) {
    cryptoStatus.textContent = "\uCF54\uC778: \uBD84\uBD09 \uAC31\uC2E0 \uC2E4\uD328";
  } finally {
    window.clearTimeout(cryptoCandleTimerId);
    cryptoCandleTimerId = window.setTimeout(refreshCryptoCandles, cryptoCandlePollMs);
  }
}

function connectCryptoFeed() {
  cryptoProducts.forEach((item) => {
    upsertCard(cryptoGrid, item.symbol, {
      symbol: item.symbol,
      name: item.name,
      market: "CRYPTO",
      price: null,
      currency: "USD",
      meta: "\uC2E4\uC2DC\uAC04 \uD2F1 \uB300\uAE30 \uC911",
      direction: "flat",
      candles: [],
      granularity: cryptoGranularity,
    });
  });

  const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  ws.addEventListener("open", () => {
    cryptoStatus.textContent = "\uCF54\uC778: \uC2E4\uC2DC\uAC04 \uC5F0\uACB0\uB428";
    ws.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: cryptoProducts.map((item) => item.symbol),
        channels: ["ticker"],
      }),
    );
  });

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type !== "ticker") {
      return;
    }

    const product = cryptoProducts.find((item) => item.symbol === payload.product_id);
    if (!product) {
      return;
    }

    const price = Number(payload.price);
    const tickTimeMs = payload.time ? Date.parse(payload.time) : Date.now();
    const open24h = Number(payload.open_24h);
    const change = Number.isFinite(open24h) ? price - open24h : null;
    const changePercent = Number.isFinite(open24h) && open24h !== 0
      ? (change / open24h) * 100
      : null;
    const candles = mergeLiveTickIntoCandles(product.symbol, price, tickTimeMs, cryptoGranularity);

    upsertCard(cryptoGrid, product.symbol, {
      symbol: product.symbol,
      name: product.name,
      market: "CRYPTO",
      price,
      currency: "USD",
      meta: `24h ${formatChange(change, changePercent)}`,
      direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
      candles,
      granularity: cryptoGranularity,
    });
  });

  ws.addEventListener("close", () => {
    cryptoStatus.textContent = "\uCF54\uC778: \uC7AC\uC5F0\uACB0 \uC911";
    setTimeout(connectCryptoFeed, 3000);
  });

  ws.addEventListener("error", () => {
    cryptoStatus.textContent = "\uCF54\uC778: \uC5F0\uACB0 \uC624\uB958";
  });
}

function scheduleStockRefresh(delay = stockPollMs) {
  window.clearTimeout(stockTimerId);
  stockTimerId = window.setTimeout(refreshStocks, delay);
}

async function refreshStocks() {
  if (stockRefreshInFlight) {
    scheduleStockRefresh(stockPollMs);
    return;
  }

  stockRefreshInFlight = true;
  stockStatus.textContent = `\uC8FC\uC2DD: ${stockPollMs / 1000}\uCD08 \uC8FC\uAE30 \uAC31\uC2E0`;

  try {
    const response = await fetch(`/api/stocks?symbols=${stockSymbols.join(",")}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    data.quotes.forEach((quote) => {
      upsertCard(stockGrid, quote.symbol, {
        symbol: quote.symbol,
        name: quote.name,
        market: quote.marketState,
        price: Number(quote.price),
        currency: quote.currency || "USD",
        meta: formatChange(quote.change, quote.changePercent),
        direction: quote.change > 0 ? "up" : quote.change < 0 ? "down" : "flat",
        candles: [],
      });
    });

    stockStatus.textContent = `\uC8FC\uC2DD: ${new Date().toLocaleTimeString("ko-KR")} \uAC31\uC2E0`;
  } catch (error) {
    stockStatus.textContent = "\uC8FC\uC2DD: \uAC31\uC2E0 \uC2E4\uD328";
  } finally {
    stockRefreshInFlight = false;
    scheduleStockRefresh(stockPollMs);
  }
}

connectCryptoFeed();
refreshCryptoCandles();
refreshStocks();
