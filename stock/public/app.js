const cryptoProducts = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "SOL-USD", name: "Solana" },
  { symbol: "XRP-USD", name: "XRP" },
];

const stockSymbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"];
const stockPollMs = 2000;
const maxHistoryPoints = 24;
const historyBySymbol = new Map();
const cryptoGrid = document.getElementById("cryptoGrid");
const stockGrid = document.getElementById("stockGrid");
const cryptoStatus = document.getElementById("cryptoStatus");
const stockStatus = document.getElementById("stockStatus");
const cardTemplate = document.getElementById("cardTemplate");

let stockRefreshInFlight = false;
let stockTimerId = null;

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
    return "Change data unavailable";
  }

  const sign = Number(change) > 0 ? "+" : "";
  const pct = changePercent === null || changePercent === undefined || Number.isNaN(Number(changePercent))
    ? ""
    : ` (${sign}${Number(changePercent).toFixed(2)}%)`;
  return `${sign}${Number(change).toFixed(2)}${pct}`;
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

function renderSparkline(card, points, direction) {
  const line = card.querySelector(".sparkline-line");
  const area = card.querySelector(".sparkline-area");
  const label = card.querySelector(".chart-label");
  const range = card.querySelector(".chart-range");
  const paths = buildSparkline(points);

  line.setAttribute("d", paths.line);
  area.setAttribute("d", paths.area);
  line.classList.remove("up", "down");
  area.classList.remove("up", "down");

  if (direction === "up") {
    line.classList.add("up");
    area.classList.add("up");
  } else if (direction === "down") {
    line.classList.add("down");
    area.classList.add("down");
  }

  label.textContent = points.length > 1 ? `최근 ${points.length}틱` : "데이터 수집 중";
  if (points.length) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    range.textContent = `${formatMoney(min)} - ${formatMoney(max)}`;
  } else {
    range.textContent = "";
  }
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

  const points = pushHistoryPoint(key, Number(payload.price));
  renderSparkline(card, points, payload.direction);

  if (previousText && previousText !== nextText) {
    flashCard(card, payload.direction);
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
      meta: "실시간 틱 대기 중",
      direction: "flat",
    });
  });

  const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  ws.addEventListener("open", () => {
    cryptoStatus.textContent = "코인: 연결됨";
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
    const open24h = Number(payload.open_24h);
    const change = Number.isFinite(open24h) ? price - open24h : null;
    const changePercent = Number.isFinite(open24h) && open24h !== 0
      ? (change / open24h) * 100
      : null;

    upsertCard(cryptoGrid, product.symbol, {
      symbol: product.symbol,
      name: product.name,
      market: "CRYPTO",
      price,
      currency: "USD",
      meta: `24h ${formatChange(change, changePercent)}`,
      direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    });
  });

  ws.addEventListener("close", () => {
    cryptoStatus.textContent = "코인: 재연결 중";
    setTimeout(connectCryptoFeed, 3000);
  });

  ws.addEventListener("error", () => {
    cryptoStatus.textContent = "코인: 연결 오류";
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
  stockStatus.textContent = `주식: ${stockPollMs / 1000}초 주기 갱신`;

  try {
    const response = await fetch(`/api/stocks?symbols=${stockSymbols.join(",")}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    data.quotes.forEach((quote) => {
      const price = Number(quote.price);
      const points = historyBySymbol.get(quote.symbol) || [];
      const prevPrice = points.length ? points[points.length - 1] : null;
      const delta = Number.isFinite(prevPrice) && Number.isFinite(price) ? price - prevPrice : quote.change;
      const deltaPct = Number.isFinite(prevPrice) && prevPrice !== 0 && Number.isFinite(price)
        ? (delta / prevPrice) * 100
        : quote.changePercent;

      upsertCard(stockGrid, quote.symbol, {
        symbol: quote.symbol,
        name: quote.name,
        market: quote.marketState,
        price,
        currency: quote.currency || "USD",
        meta: `틱 변동 ${formatChange(delta, deltaPct)}`,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      });
    });

    stockStatus.textContent = `주식: ${new Date().toLocaleTimeString("ko-KR")} 갱신`;
  } catch (error) {
    stockStatus.textContent = "주식: 갱신 실패";
  } finally {
    stockRefreshInFlight = false;
    scheduleStockRefresh(stockPollMs);
  }
}

connectCryptoFeed();
refreshStocks();
