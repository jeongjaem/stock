# PulseBoard for Cloudflare Pages

GitHub and Cloudflare Pages based market dashboard for crypto and US stocks.

## Features

- Live crypto prices via Coinbase WebSocket
- US stock API via Cloudflare Pages Functions
- Minute-candle ready stock cards when `ALPHA_VANTAGE_API_KEY` is configured
- Mobile friendly dashboard UI

## Project structure

- `public/index.html`: main page
- `public/styles.css`: dashboard styles
- `public/app.js`: realtime UI logic
- `functions/api/stocks.js`: stock API function
- `wrangler.jsonc`: Cloudflare Pages config

## Local run

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:8788
```

## Intraday minute candles

Set `ALPHA_VANTAGE_API_KEY` in Cloudflare Pages environment variables to enable intraday minute candles for US stocks.

Without this key, the app falls back to the public quote feed and a simpler trend view.

## Cloudflare Pages deploy

```text
Framework preset: None
Build command: (leave empty)
Build output directory: public
Root directory: /
```

If this project lives inside a `stock` subfolder in your GitHub repo, set `Root directory` to `stock`.
