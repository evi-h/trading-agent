import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG } from "./config.js";

const INDEX_OVERRIDES: Record<string, string> = {
  "TVC:DJI": "^DJI",
  "TVC:DXY": "DX-Y.NYB",
  "TVC:NDQ": "^IXIC",
  "SP:SPX": "^GSPC",
  "CBOE:VIX": "^VIX",
  "TSX:TSX": "^OSPTSX",
  "BITSTAMP:BTCUSD": "BTC-USD",
  "BITSTAMP:ETHUSD": "ETH-USD",
};

function toYahooSymbol(entry: string): string {
  if (entry in INDEX_OVERRIDES) return INDEX_OVERRIDES[entry];

  const colonIdx = entry.indexOf(":");
  if (colonIdx === -1) return entry;

  const exchange = entry.slice(0, colonIdx);
  const ticker = entry.slice(colonIdx + 1);

  if (exchange === "TSX") {
    return ticker.replace(/\./g, "-") + ".TO";
  }

  // NASDAQ, NYSE, AMEX, CBOE, etc. — strip prefix
  return ticker;
}

export function readWatchlist(filePath?: string): string[] {
  const fullPath = resolve(filePath ?? CONFIG.watchlistPath);

  let raw: string;
  try {
    raw = readFileSync(fullPath, "utf-8");
  } catch {
    console.error(`Error: Watchlist file not found at ${fullPath}`);
    console.error("Export your watchlist from TradingView and save it as watchlist.txt");
    process.exit(1);
  }

  const seen = new Set<string>();
  const tickers: string[] = [];

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim().toUpperCase();
    if (!trimmed || trimmed.startsWith("###")) continue;

    const symbol = toYahooSymbol(trimmed);
    if (!seen.has(symbol)) {
      seen.add(symbol);
      tickers.push(symbol);
    }
  }

  if (tickers.length === 0) {
    console.error("Error: Watchlist file is empty. Add at least one ticker.");
    process.exit(1);
  }

  console.log(`Loaded ${tickers.length} tickers from watchlist`);
  return tickers;
}
