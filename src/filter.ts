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
 * Cup & handle heuristic:
 * 1. Cup: rounded bottom in the last 60 candles — lowest close is not at edges,
 *    and price recovered ≥80% of the drop from the prior high.
 * 2. Handle: after the recovery, a small pullback (5–15% of the cup depth)
 *    that doesn't fall below 50% of the cup. The handle should be in the
 *    last ~10 candles (recent consolidation near the prior high).
 */
function looksLikeCupAndHandle(stock: EnrichedStock): boolean {
  const candles = stock.candles.slice(-60);
  if (candles.length < 35) return false;

  const closes = candles.map((c) => c.close);

  // --- Cup detection ---
  // Find the cup bottom (lowest close), excluding the last 10 candles (handle zone)
  const cupZone = closes.slice(0, closes.length - 10);
  let minIdx = 0;
  for (let i = 1; i < cupZone.length; i++) {
    if (cupZone[i] < cupZone[minIdx]) minIdx = i;
  }

  // Bottom must not be at the very start (need a left rim)
  if (minIdx < 10) return false;

  const leftRimHigh = Math.max(...closes.slice(0, minIdx));
  const cupBottom = closes[minIdx];
  const cupDepth = leftRimHigh - cupBottom;

  if (cupDepth <= 0) return false;

  // Cup must be meaningfully deep (not a trivial 1-2% wobble)
  if (cupDepth / leftRimHigh < CONFIG.minCupDepthPct) return false;

  // Price must have recovered ≥80% of the cup depth after the bottom
  const postCupHigh = Math.max(...closes.slice(minIdx));
  const recovery = (postCupHigh - cupBottom) / cupDepth;
  if (recovery < 0.8) return false;

  // --- Handle detection ---
  // Handle = last ~10 candles, should show a small dip from the post-cup high
  const handleZone = closes.slice(-10);
  const handleLow = Math.min(...handleZone);
  const handleDip = postCupHigh - handleLow;

  // Handle dip should be between 5% and 50% of cup depth (shallow pullback)
  const dipRatio = handleDip / cupDepth;
  if (dipRatio < 0.05 || dipRatio > 0.5) return false;

  // Handle low must stay above the midpoint of the cup
  const cupMidpoint = cupBottom + cupDepth * 0.5;
  if (handleLow < cupMidpoint) return false;

  return true;
}

/**
 * Collect local extrema (maxima or minima) from a close array using a 5-candle window.
 */
function findLocalExtrema(
  closes: number[],
  type: "max" | "min"
): Array<{ idx: number; val: number }> {
  const extrema: Array<{ idx: number; val: number }> = [];
  const compareFn = type === "max" ? Math.max : Math.min;

  for (let i = 5; i < closes.length - 5; i++) {
    const window = closes.slice(i - 5, i + 6);
    if (closes[i] === compareFn(...window)) {
      extrema.push({ idx: i, val: closes[i] });
    }
  }
  return extrema;
}

/**
 * Head & shoulders heuristic: three peaks where the middle is highest,
 * with adequate spacing between peaks and a relatively flat neckline.
 */
function looksLikeHeadAndShoulders(stock: EnrichedStock): boolean {
  const candles = stock.candles.slice(-60);
  if (candles.length < 40) return false;

  const closes = candles.map((c) => c.close);
  const peaks = findLocalExtrema(closes, "max");

  if (peaks.length < 3) return false;

  for (let i = 0; i < peaks.length - 2; i++) {
    const left = peaks[i];
    const head = peaks[i + 1];
    const right = peaks[i + 2];

    if (!(head.val > left.val && head.val > right.val)) continue;

    // Peaks must be adequately spaced in time
    if (head.idx - left.idx < CONFIG.minPeakSpacing) continue;
    if (right.idx - head.idx < CONFIG.minPeakSpacing) continue;

    // Find neckline troughs between left-head and head-right
    const trough1 = Math.min(...closes.slice(left.idx, head.idx + 1));
    const trough2 = Math.min(...closes.slice(head.idx, right.idx + 1));

    // Neckline must be relatively flat (troughs within 5% of head value)
    if (Math.abs(trough1 - trough2) > head.val * 0.05) continue;

    return true;
  }
  return false;
}

/**
 * Inverse head & shoulders: three troughs where the middle is lowest,
 * with adequate spacing and a relatively flat neckline. Bullish reversal pattern.
 */
function looksLikeInverseHeadAndShoulders(stock: EnrichedStock): boolean {
  const candles = stock.candles.slice(-60);
  if (candles.length < 40) return false;

  const closes = candles.map((c) => c.close);
  const troughs = findLocalExtrema(closes, "min");

  if (troughs.length < 3) return false;

  for (let i = 0; i < troughs.length - 2; i++) {
    const left = troughs[i];
    const head = troughs[i + 1];
    const right = troughs[i + 2];

    if (!(head.val < left.val && head.val < right.val)) continue;

    // Troughs must be adequately spaced in time
    if (head.idx - left.idx < CONFIG.minPeakSpacing) continue;
    if (right.idx - head.idx < CONFIG.minPeakSpacing) continue;

    // Find neckline peaks between left-head and head-right
    const peak1 = Math.max(...closes.slice(left.idx, head.idx + 1));
    const peak2 = Math.max(...closes.slice(head.idx, right.idx + 1));

    // Neckline must be relatively flat (peaks within 5% of higher peak)
    const higherPeak = Math.max(peak1, peak2);
    if (Math.abs(peak1 - peak2) > higherPeak * 0.05) continue;

    return true;
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
    if (looksLikeCupAndHandle(stock) || looksLikeHeadAndShoulders(stock) || looksLikeInverseHeadAndShoulders(stock)) {
      result.get("patterns")!.push(stock);
    }

    // RSI signals
    if (indicators.rsi < CONFIG.rsiOversold || indicators.rsi > CONFIG.rsiOverbought) {
      result.get("rsi")!.push(stock);
    }
  }

  return result;
}
