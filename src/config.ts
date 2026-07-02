import "dotenv/config";

// --- Tuneable Parameters ---

export const CONFIG = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  smaShort: 150,
  smaLong: 200,
  historicalDays: 250,
  minAvgVolume: 500_000,
  claudeModel: "claude-opus-4-8" as const,
  claudeMaxTokens: 16_000,
  fetchBatchSize: 5,
  fetchBatchDelayMs: 500,
  smaProximity: 0.03,        // ±3% of SMA value to qualify for SMA sections
  smaCrossoverWindow: 5,     // days to look back for recent SMA crossover
  minCupDepthPct: 0.07,     // cup depth / left rim high must exceed 7%
  minPeakSpacing: 8,        // minimum candles between H&S peaks
  timezone: "America/New_York",
  watchlistPath: "watchlist.txt",
  // Performance tracker retention — these bounds keep picks.json flat forever
  trackerMaxOpenTradingDays: 30,    // trading days before an unresolved pick expires
  trackerMaxOpenCalendarDays: 60,   // calendar backstop (covers tickers dropped from watchlist)
  trackerClosedRetentionDays: 90,   // closed-pick detail kept this long, then folded into stats
  // Tickers shown in the market snapshot strip at the top of the email,
  // in display order. Skipped silently if not in the watchlist / not fetched.
  marketSnapshot: [
    { ticker: "SPY", label: "SPY" },
    { ticker: "QQQ", label: "QQQ" },
    { ticker: "^DJI", label: "DJI" },
    { ticker: "^GSPTSE", label: "TSX" },
    { ticker: "DX-Y.NYB", label: "DXY" },
  ],
} as const;

// --- Environment Variables ---

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const ENV = {
  get anthropicApiKey() { return requireEnv("ANTHROPIC_API_KEY"); },
  get smtpHost() { return process.env.SMTP_HOST ?? "smtp.gmail.com"; },
  get smtpPort() { return parseInt(process.env.SMTP_PORT ?? "587", 10); },
  get smtpUser() { return requireEnv("SMTP_USER"); },
  get smtpPass() { return requireEnv("SMTP_PASS"); },
  get emailFrom() { return requireEnv("EMAIL_FROM"); },
  get emailTo() { return requireEnv("EMAIL_TO"); },
  get forceRun() { return process.env.FORCE_RUN === "true"; },
  get dryRun() { return process.env.DRY_RUN === "true"; },
  get trackerDataDir() { return process.env.TRACKER_DATA_DIR ?? "data"; },
};

// --- Types ---

export interface Candle {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  ticker: string;
  companyName: string;
  isIndex: boolean;          // INDEX/CURRENCY instruments — market context only, not tradeable setups
  currentPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  volume: number;
  avgVolume20d: number;
  high52w: number;
  low52w: number;
  candles: Candle[];
}

export type SectionName = "sma150" | "sma200" | "longterm" | "patterns" | "rsi";

export interface IndicatorResult {
  rsi: number;
  sma150: number | null;
  sma200: number | null;
  rsiSignal: "oversold" | "overbought" | null;
  priceVsSma150: "above" | "below" | null;
  priceVsSma200: "above" | "below" | null;
  volumeRatio: number;       // today's volume / 20d avg
  priceChange5d: number;     // % change over last 5 trading days
  priceChange1m: number;     // % change over last ~21 trading days
  priceChange3m: number;     // % change over last ~63 trading days
  weekPosition52: number;    // 0.0–1.0: where price sits between 52w low and high
}

export interface EnrichedStock extends StockData {
  indicators: IndicatorResult;
  cupHandleTarget?: number;   // measured move target price (cup & handle only)
}

export interface BriefingMeta {
  date: string;
  tickerCount: number;
  generationTimeSeconds: number;
  setupCount?: number;       // filled in after the email HTML is built
}

export interface MarketSnapshotEntry {
  label: string;
  changePct: number;
}
