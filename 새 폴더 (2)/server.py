import json
import mimetypes
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")


STOCK_NAMES = {
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "TSLA": "Tesla",
    "AMZN": "Amazon",
    "META": "Meta",
}


def fetch_stooq_quote(symbol):
    stooq_symbol = f"{symbol.lower()}.us"
    url = f"https://stooq.com/q/l/?s={stooq_symbol}&f=sd2t2ohlcvn&e=csv"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/csv",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        text = response.read().decode("utf-8").strip()

    if not text:
        raise ValueError(f"No data for {symbol}")

    parts = [item.strip() for item in text.split(",")]
    if len(parts) < 8:
        raise ValueError(f"Malformed data for {symbol}")

    close_price = parts[6]
    if close_price in ("", "N/D"):
        price = None
    else:
        price = float(close_price)

    return {
        "symbol": symbol,
        "name": STOCK_NAMES.get(symbol, symbol),
        "price": price,
        "change": None,
        "changePercent": None,
        "currency": "USD",
        "marketState": "PUBLIC FEED",
    }


def fetch_stock_quotes(symbols):
    return [fetch_stooq_quote(symbol) for symbol in symbols]


class StockTrackerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/stocks":
            self.handle_stock_api(parsed)
            return

        if parsed.path == "/" or parsed.path == "":
            self.serve_file("index.html")
            return

        safe_path = os.path.normpath(parsed.path.lstrip("/"))
        target_path = os.path.join(PUBLIC_DIR, safe_path)

        if not target_path.startswith(PUBLIC_DIR):
            self.send_error(403, "Forbidden")
            return

        if os.path.isfile(target_path):
            self.serve_file(safe_path)
            return

        self.send_error(404, "Not Found")

    def handle_stock_api(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        raw_symbols = query.get("symbols", ["AAPL,MSFT,NVDA,TSLA"])
        symbols = [item.strip().upper() for item in raw_symbols[0].split(",") if item.strip()]

        if not symbols:
            symbols = ["AAPL", "MSFT", "NVDA", "TSLA"]

        try:
            quotes = fetch_stock_quotes(symbols[:20])
            body = json.dumps({"quotes": quotes}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def serve_file(self, relative_path):
        file_path = os.path.join(PUBLIC_DIR, relative_path)
        if not os.path.isfile(file_path):
            self.send_error(404, "Not Found")
            return

        with open(file_path, "rb") as file_handle:
            content = file_handle.read()

        content_type, _ = mimetypes.guess_type(file_path)
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), StockTrackerHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    server.serve_forever()
