import { CONFIG, type Candle, type IndicatorResult, type StockData } from "./config.js";

/**
 * Calculate RSI using Wilder smoothing method (matches TradingView).
 */
export function calculateRSI(closes: number[], period: number = CONFIG.rsiPeriod): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss over the first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing for remaining data points
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate Simple Moving Average over the last `period` values.
 */
export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

function priceChangePct(closes: number[], lookback: number): number {
  if (closes.length <= lookback) return 0;
  const past = closes[closes.length - 1 - lookback];
  const current = closes[closes.length - 1];
  return ((current - past) / past) * 100;
}

/**
 * Compute all indicators for a stock's candle data.
 */
export function analyzeIndicators(stock: Pick<StockData, "candles" | "volume" | "avgVolume20d" | "currentPrice" | "high52w" | "low52w">): IndicatorResult {
  const { candles, volume, avgVolume20d, currentPrice, high52w, low52w } = stock;
  const closes = candles.map((c) => c.close);

  const rsi = calculateRSI(closes) ?? 50;
  const sma150 = calculateSMA(closes, CONFIG.smaShort);
  const sma200 = calculateSMA(closes, CONFIG.smaLong);

  let rsiSignal: IndicatorResult["rsiSignal"] = null;
  if (rsi <= CONFIG.rsiOversold) rsiSignal = "oversold";
  else if (rsi >= CONFIG.rsiOverbought) rsiSignal = "overbought";

  const priceRange52 = high52w - low52w;
  const weekPosition52 = priceRange52 > 0
    ? Math.min(1, Math.max(0, (currentPrice - low52w) / priceRange52))
    : 0.5;

  return {
    rsi: Math.round(rsi * 100) / 100,
    sma150: sma150 ? Math.round(sma150 * 100) / 100 : null,
    sma200: sma200 ? Math.round(sma200 * 100) / 100 : null,
    rsiSignal,
    priceVsSma150: sma150 ? (currentPrice >= sma150 ? "above" : "below") : null,
    priceVsSma200: sma200 ? (currentPrice >= sma200 ? "above" : "below") : null,
    volumeRatio: avgVolume20d > 0 ? volume / avgVolume20d : 1,
    priceChange5d: priceChangePct(closes, 5),
    priceChange1m: priceChangePct(closes, 21),
    priceChange3m: priceChangePct(closes, 63),
    weekPosition52,
  };
}
