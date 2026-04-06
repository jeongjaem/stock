const STOCK_NAMES = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMZN: "Amazon",
  META: "Meta",
};

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const DEFAULT_INTERVAL = "1min";
const MAX_CANDLES = 24;

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildAlphaVantageUrl(symbol, apiKey, interval = DEFAULT_INTERVAL) {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  url.searchParams.set("function", "TIME_SERIES_INTRADAY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("extended_hours", "false");
  url.searchParams.set("apikey", apiKey);
  return url.toString();
}

function parseAlphaVantageCandles(payload, symbol, interval = DEFAULT_INTERVAL) {
  const key = `Time Series (${interval})`;
  const series = payload[key];

  if (!series || typeof series !== "object") {
    const message = payload.Note || payload.Information || payload["Error Message"] || `No intraday series for ${symbol}`;
    throw new Error(message);
  }

  const candles = Object.entries(series)
    .map(([timestamp, candle]) => ({
      timestamp,
      open: numberOrNull(candle["1. open"]),
      high: numberOrNull(candle["2. high"]),
      low: numberOrNull(candle["3. low"]),
      close: numberOrNull(candle["4. close"]),
      volume: numberOrNull(candle["5. volume"]),
    }))
    .filter((candle) => candle.open !== null && candle.high !== null && candle.low !== null && candle.close !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-MAX_CANDLES);

  if (candles.length < 2) {
    throw new Error(`Not enough candle data for ${symbol}`);
  }

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const change = latest.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : null;

  return {
    symbol,
    name: STOCK_NAMES[symbol] || symbol,
    price: latest.close,
    change,
    changePercent,
    currency: "USD",
    marketState: `${interval.toUpperCase()} CANDLES`,
    candles,
    source: "alpha_vantage",
  };
}

async function fetchAlphaVantageQuote(symbol, apiKey, interval = DEFAULT_INTERVAL) {
  const response = await fetch(buildAlphaVantageUrl(symbol, apiKey, interval), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Alpha Vantage error ${response.status} for ${symbol}`);
  }

  const payload = await response.json();
  return parseAlphaVantageCandles(payload, symbol, interval);
}

async function fetchStooqQuote(symbol) {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlcvn&e=csv`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream error ${response.status} for ${symbol}`);
  }

  const text = (await response.text()).trim();
  if (!text) {
    throw new Error(`No data for ${symbol}`);
  }

  const parts = text.split(",").map((part) => part.trim());
  if (parts.length < 8) {
    throw new Error(`Malformed data for ${symbol}`);
  }

  const closePrice = parts[6];
  const price = closePrice === "" || closePrice === "N/D" ? null : Number(closePrice);

  return {
    symbol,
    name: STOCK_NAMES[symbol] || symbol,
    price,
    change: null,
    changePercent: null,
    currency: "USD",
    marketState: "PUBLIC FEED",
    candles: [],
    source: "stooq",
  };
}

async function fetchQuote(symbol, env, interval) {
  const apiKey = env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return fetchStooqQuote(symbol);
  }

  try {
    return await fetchAlphaVantageQuote(symbol, apiKey, interval);
  } catch (error) {
    return {
      ...(await fetchStooqQuote(symbol)),
      fallbackReason: error instanceof Error ? error.message : "Unknown intraday error",
    };
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const rawSymbols = url.searchParams.get("symbols") || "AAPL,MSFT,NVDA,TSLA";
    const interval = url.searchParams.get("interval") || DEFAULT_INTERVAL;
    const symbols = rawSymbols
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    const quotes = await Promise.all(symbols.map((symbol) => fetchQuote(symbol, context.env, interval)));

    return Response.json(
      {
        quotes,
        interval,
        usingIntraday: Boolean(context.env.ALPHA_VANTAGE_API_KEY),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
