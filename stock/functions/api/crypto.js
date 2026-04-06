const MAX_CANDLES = 24;
const DEFAULT_GRANULARITY = 60;
const COINBASE_BASE_URL = "https://api.exchange.coinbase.com";

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchCoinbaseCandles(productId, granularity = DEFAULT_GRANULARITY) {
  const url = new URL(`${COINBASE_BASE_URL}/products/${productId}/candles`);
  url.searchParams.set("granularity", String(granularity));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Coinbase candle error ${response.status} for ${productId}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Malformed candle payload for ${productId}`);
  }

  return payload
    .map((item) => ({
      time: Number(item[0]),
      low: numberOrNull(item[1]),
      high: numberOrNull(item[2]),
      open: numberOrNull(item[3]),
      close: numberOrNull(item[4]),
      volume: numberOrNull(item[5]),
    }))
    .filter((item) =>
      Number.isFinite(item.time) &&
      item.low !== null &&
      item.high !== null &&
      item.open !== null &&
      item.close !== null
    )
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES);
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const rawProducts = url.searchParams.get("products") || "BTC-USD,ETH-USD,SOL-USD,XRP-USD";
    const granularity = Number(url.searchParams.get("granularity") || DEFAULT_GRANULARITY);
    const products = rawProducts
      .split(",")
      .map((product) => product.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 12);

    const items = await Promise.all(
      products.map(async (productId) => ({
        productId,
        candles: await fetchCoinbaseCandles(productId, granularity),
      })),
    );

    return Response.json(
      {
        products: items,
        granularity,
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
