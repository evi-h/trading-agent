import { CONFIG, type EnrichedStock, type SectionName } from "./config.js";

/**
 * Check whether price crossed above the given SMA within the last `window` candles.
 * Returns true if close was below SMA `window` days ago and is above it today.
 */
function crossedAboveSma(stock: EnrichedStock, smaValue: number, window: number): boolean {
  const candles = stock.candles;
  if (candles.length <= window) return false;
  const pastClose = candles[candles.length - 1 - window].close;
  const currentClose = stock.currentPrice;
  return pastClose < smaValue && currentClose >= smaValue;
}

/**
 * Cup heuristic: find the lowest close in the last 40 candles, check it's
 * not at either edge (≥15 candles from both ends) and price has recovered
 * ≥80% of its drop from the prior high back toward it.
 */
function looksLikeCup(stock: EnrichedStock): boolean {
  const candles = stock.candles.slice(-40);
  if (candles.length < 30) return false;

  const closes = candles.map((c) => c.close);
  let minIdx = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] < closes[minIdx]) minIdx = i;
  }

  // Bottom must not be at the edges
  if (minIdx < 15 || minIdx > closes.length - 10) return false;

  const priorHigh = Math.max(...closes.slice(0, minIdx));
  const bottom = closes[minIdx];
  const current = closes[closes.length - 1];
  const drop = priorHigh - bottom;

  if (drop <= 0) return false;
  const recovery = (current - bottom) / drop;
  return recovery >= 0.8;
}

/**
 * Head & shoulders heuristic: find three local maxima in the last 60 candles
 * where the middle peak is higher than both flanking peaks.
 */
function looksLikeHeadAndShoulders(stock: EnrichedStock): boolean {
  const candles = stock.candles.slice(-60);
  if (candles.length < 40) return false;

  const closes = candles.map((c) => c.close);

  // Collect local maxima (higher than neighbors within a 5-candle window)
  const peaks: Array<{ idx: number; val: number }> = [];
  for (let i = 5; i < closes.length - 5; i++) {
    const window = closes.slice(i - 5, i + 6);
    if (closes[i] === Math.max(...window)) {
      peaks.push({ idx: i, val: closes[i] });
    }
  }

  if (peaks.length < 3) return false;

  // Check any triplet where the middle is higher than both flanking peaks
  for (let i = 0; i < peaks.length - 2; i++) {
    const left = peaks[i];
    const head = peaks[i + 1];
    const right = peaks[i + 2];
    if (head.val > left.val && head.val > right.val) {
      return true;
    }
  }
  return false;
}

/**
 * Pass 1: Filter all stocks into per-section candidate lists.
 * A ticker can appear in multiple sections.
 */
export function filterStocks(stocks: EnrichedStock[]): Map<SectionName, EnrichedStock[]> {
  const result = new Map<SectionName, EnrichedStock[]>([
    ["sma150", []],
    ["sma200", []],
    ["longterm", []],
    ["patterns", []],
    ["rsi", []],
  ]);

  for (const stock of stocks) {
    const { indicators } = stock;
    const { sma150, sma200 } = indicators;

    // SMA 150 setups
    if (sma150 !== null) {
      const within3pct = Math.abs(stock.currentPrice - sma150) / sma150 <= CONFIG.smaProximity;
      const recentCrossover = crossedAboveSma(stock, sma150, CONFIG.smaCrossoverWindow);
      if (within3pct || recentCrossover) {
        result.get("sma150")!.push(stock);
      }
    }

    // SMA 200 setups
    if (sma200 !== null) {
      const within3pct = Math.abs(stock.currentPrice - sma200) / sma200 <= CONFIG.smaProximity;
      const recentCrossover = crossedAboveSma(stock, sma200, CONFIG.smaCrossoverWindow);
      if (within3pct || recentCrossover) {
        result.get("sma200")!.push(stock);
      }
    }

    // Long-term setups: above both SMAs, positive 3-month trend, volume elevated
    if (
      sma150 !== null &&
      sma200 !== null &&
      indicators.priceVsSma150 === "above" &&
      indicators.priceVsSma200 === "above" &&
      indicators.priceChange3m > 0 &&
      indicators.volumeRatio > 1.0
    ) {
      result.get("longterm")!.push(stock);
    }

    // Pattern candidates
    if (looksLikeCup(stock) || looksLikeHeadAndShoulders(stock)) {
      result.get("patterns")!.push(stock);
    }

    // RSI signals
    if (indicators.rsi < CONFIG.rsiOversold || indicators.rsi > CONFIG.rsiOverbought) {
      result.get("rsi")!.push(stock);
    }
  }

  return result;
}
