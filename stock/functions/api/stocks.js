const STOCK_NAMES = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMZN: "Amazon",
  META: "Meta",
};

const ALPACA_SNAPSHOTS_URL = "https://data.alpaca.markets/v2/stocks/snapshots";
const ALPACA_BARS_URL = "https://data.alpaca.markets/v2/stocks/bars";
const MAX_BARS = 15;

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildHeaders(env) {
  return {
    "APCA-API-KEY-ID": env.APCA_API_KEY_ID,
    "APCA-API-SECRET-KEY": env.APCA_API_SECRET_KEY,
    Accept: "application/json",
  };
}

async function fetchAlpacaSnapshots(symbols, env) {
  const url = new URL(ALPACA_SNAPSHOTS_URL);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("feed", "iex");

  const response = await fetch(url.toString(), {
    headers: buildHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Alpaca snapshot error ${response.status}`);
  }

  return response.json();
}

async function fetchAlpacaBars(symbols, env) {
  const url = new URL(ALPACA_BARS_URL);
  const end = new Date();
  const start = new Date(end.getTime() - 1000 * 60 * 20);

  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("timeframe", "1Min");
  url.searchParams.set("feed", "iex");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());
  url.searchParams.set("limit", String(MAX_BARS));
  url.searchParams.set("sort", "asc");

  const response = await fetch(url.toString(), {
    headers: buildHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Alpaca bars error ${response.status}`);
  }

  return response.json();
}

async function fetchAlpacaQuotes(symbols, env) {
  const [snapshotsPayload, barsPayload] = await Promise.all([
    fetchAlpacaSnapshots(symbols, env),
    fetchAlpacaBars(symbols, env),
  ]);

  return symbols.map((symbol) => {
    const snapshot = snapshotsPayload[symbol];
    const trade = snapshot?.latestTrade || null;
    const minuteBar = snapshot?.minuteBar || null;
    const dailyBar = snapshot?.dailyBar || null;
    const prevDailyBar = snapshot?.prevDailyBar || null;
    const symbolBars = Array.isArray(barsPayload.bars?.[symbol]) ? barsPayload.bars[symbol] : [];

    const price = numberOrNull(trade?.p) ?? numberOrNull(minuteBar?.c) ?? numberOrNull(dailyBar?.c);
    const previousClose = numberOrNull(prevDailyBar?.c);
    const change = previousClose !== null && price !== null ? price - previousClose : null;
    const changePercent = previousClose && price !== null ? (change / previousClose) * 100 : null;

    return {
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      price,
      change,
      changePercent,
      currency: "USD",
      marketState: "IEX REAL-TIME",
      source: "alpaca_iex",
      bars: symbolBars.map((bar) => ({
        time: bar.t,
        open: numberOrNull(bar.o),
        high: numberOrNull(bar.h),
        low: numberOrNull(bar.l),
        close: numberOrNull(bar.c),
        volume: numberOrNull(bar.v),
      })),
    };
  });
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
    source: "stooq",
    bars: [],
  };
}

async function fetchQuotes(symbols, env) {
  if (env.APCA_API_KEY_ID && env.APCA_API_SECRET_KEY) {
    try {
      return await fetchAlpacaQuotes(symbols, env);
    } catch (error) {
      const fallback = await Promise.all(symbols.map(fetchStooqQuote));
      return fallback.map((item) => ({
        ...item,
        fallbackReason: error instanceof Error ? error.message : "Unknown Alpaca error",
      }));
    }
  }

  return Promise.all(symbols.map(fetchStooqQuote));
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const rawSymbols = url.searchParams.get("symbols") || "AAPL,MSFT,NVDA,TSLA";
    const symbols = rawSymbols
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    const quotes = await fetchQuotes(symbols, context.env);

    return Response.json(
      {
        quotes,
        usingAlpacaIex: Boolean(context.env.APCA_API_KEY_ID && context.env.APCA_API_SECRET_KEY),
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
