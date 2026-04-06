const STOCK_NAMES = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMZN: "Amazon",
  META: "Meta",
};

const ALPACA_BASE_URL = "https://data.alpaca.markets/v2/stocks/snapshots";

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchAlpacaSnapshots(symbols, env) {
  const url = new URL(ALPACA_BASE_URL);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("feed", "iex");

  const response = await fetch(url.toString(), {
    headers: {
      "APCA-API-KEY-ID": env.APCA_API_KEY_ID,
      "APCA-API-SECRET-KEY": env.APCA_API_SECRET_KEY,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca snapshot error ${response.status}`);
  }

  const payload = await response.json();
  return symbols.map((symbol) => {
    const snapshot = payload[symbol];
    const trade = snapshot?.latestTrade || null;
    const minuteBar = snapshot?.minuteBar || null;
    const dailyBar = snapshot?.dailyBar || null;
    const prevDailyBar = snapshot?.prevDailyBar || null;

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
      tradeTimestamp: trade?.t || null,
      minuteBar,
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
  };
}

async function fetchQuotes(symbols, env) {
  if (env.APCA_API_KEY_ID && env.APCA_API_SECRET_KEY) {
    try {
      return await fetchAlpacaSnapshots(symbols, env);
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
