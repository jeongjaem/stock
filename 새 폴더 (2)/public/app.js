const cryptoProducts = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "SOL-USD", name: "Solana" },
  { symbol: "XRP-USD", name: "XRP" },
];

const stockSymbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"];
const cryptoGrid = document.getElementById("cryptoGrid");
const stockGrid = document.getElementById("stockGrid");
const cryptoStatus = document.getElementById("cryptoStatus");
const stockStatus = document.getElementById("stockStatus");
const cardTemplate = document.getElementById("cardTemplate");

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
  if (change === null || change === undefined) {
    return "Change data unavailable";
  }

  const sign = Number(change) > 0 ? "+" : "";
  const pct = changePercent === null || changePercent === undefined
    ? ""
    : ` (${sign}${Number(changePercent).toFixed(2)}%)`;
  return `${sign}${Number(change).toFixed(2)}${pct}`;
}

function upsertCard(container, key, payload) {
  let card = container.querySelector(`[data-key="${key}"]`);
  if (!card) {
    const fragment = cardTemplate.content.cloneNode(true);
    card = fragment.querySelector(".card");
    card.dataset.key = key;
    container.appendChild(fragment);
    card = container.querySelector(`[data-key="${key}"]`);
  }

  card.querySelector(".symbol").textContent = payload.symbol;
  card.querySelector(".name").textContent = payload.name;
  card.querySelector(".market-tag").textContent = payload.market;
  card.querySelector(".price").textContent = formatMoney(payload.price, payload.currency);

  const meta = card.querySelector(".meta");
  meta.textContent = payload.meta;
  meta.classList.remove("up", "down");

  if (payload.direction === "up") {
    meta.classList.add("up");
  } else if (payload.direction === "down") {
    meta.classList.add("down");
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
      meta: "Waiting for live ticks",
      direction: "flat",
    });
  });

  const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  ws.addEventListener("open", () => {
    cryptoStatus.textContent = "Crypto: Connected";
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
    cryptoStatus.textContent = "Crypto: Reconnecting";
    setTimeout(connectCryptoFeed, 3000);
  });

  ws.addEventListener("error", () => {
    cryptoStatus.textContent = "Crypto: Connection error";
  });
}

async function refreshStocks() {
  try {
    stockStatus.textContent = "Stocks: Refreshing";
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
        price: quote.price,
        currency: quote.currency || "USD",
        meta: formatChange(quote.change, quote.changePercent),
        direction: quote.change > 0 ? "up" : quote.change < 0 ? "down" : "flat",
      });
    });

    stockStatus.textContent = `Stocks: Updated ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (error) {
    stockStatus.textContent = "Stocks: Refresh failed";
  }
}

connectCryptoFeed();
refreshStocks();
setInterval(refreshStocks, 5000);
