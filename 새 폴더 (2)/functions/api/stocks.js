const STOCK_NAMES = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMZN: "Amazon",
  META: "Meta",
};

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
  };
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

    const quotes = await Promise.all(symbols.map(fetchStooqQuote));

    return Response.json(
      { quotes },
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
