import { CONFIG, type StockData, type EnrichedStock, type Candle } from "./config.js";
import { analyzeIndicators } from "./indicators.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
  };
  meta: {
    shortName?: string;
    longName?: string;
    currency: string;
    instrumentType?: string;
    regularMarketPrice: number;
    previousClose: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
  };
}

async function fetchChart(ticker: string): Promise<YahooChartResult> {
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - Math.ceil(CONFIG.historicalDays * 1.5) * 86400; // extra buffer for weekends

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startDate}&period2=${endDate}&interval=1d&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance chart API returned ${res.status} for ${ticker}`);
  }

  const data = await res.json() as { chart: { result: YahooChartResult[] } };
  const result = data.chart?.result?.[0];

  if (!result || !result.timestamp) {
    throw new Error(`No chart data returned for ${ticker}`);
  }

  return result;
}

async function fetchSingleStock(ticker: string): Promise<EnrichedStock | null> {
  try {
    const chart = await fetchChart(ticker);

    const quotes = chart.indicators.quote[0];
    const timestamps = chart.timestamp;

    // Build candles, filtering out null data points
    const allCandles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] != null && quotes.open[i] != null) {
        const d = new Date(timestamps[i] * 1000);
        allCandles.push({
          date: d.toISOString().split("T")[0],
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume[i] ?? 0,
        });
      }
    }

    if (allCandles.length < CONFIG.smaLong) {
      console.warn(`  Skipping ${ticker}: insufficient data (${allCandles.length} days)`);
      return null;
    }

    const meta = chart.meta;

    // Check average volume filter — indices and currency indexes (VIX, DXY)
    // report zero volume on Yahoo, so the illiquidity filter doesn't apply to them
    const recentVolumes = allCandles.slice(-20).map((d) => d.volume);
    const avgVolume20d = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const exemptFromVolumeFilter = meta.instrumentType === "INDEX" || meta.instrumentType === "CURRENCY";

    if (!exemptFromVolumeFilter && avgVolume20d < CONFIG.minAvgVolume) {
      console.warn(`  Skipping ${ticker}: avg volume ${Math.round(avgVolume20d).toLocaleString()} < ${CONFIG.minAvgVolume.toLocaleString()}`);
      return null;
    }

    const candles = allCandles.slice(-CONFIG.historicalDays);
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const dailyChange = lastCandle.close - prevCandle.close;
    const dailyChangePercent = (dailyChange / prevCandle.close) * 100;

    const stockData: StockData = {
      ticker,
      companyName: meta.shortName ?? meta.longName ?? ticker,
      currentPrice: lastCandle.close,
      dailyChange: Math.round(dailyChange * 100) / 100,
      dailyChangePercent: Math.round(dailyChangePercent * 100) / 100,
      volume: lastCandle.volume,
      avgVolume20d: Math.round(avgVolume20d),
      high52w: meta.fiftyTwoWeekHigh ?? 0,
      low52w: meta.fiftyTwoWeekLow ?? 0,
      candles,
    };

    const indicators = analyzeIndicators(stockData);

    return { ...stockData, indicators };
  } catch (error) {
    console.error(`  Error fetching ${ticker}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchStockData(tickers: string[]): Promise<EnrichedStock[]> {
  const results: EnrichedStock[] = [];

  for (let i = 0; i < tickers.length; i += CONFIG.fetchBatchSize) {
    const batch = tickers.slice(i, i + CONFIG.fetchBatchSize);
    console.log(`  Fetching batch ${Math.floor(i / CONFIG.fetchBatchSize) + 1}/${Math.ceil(tickers.length / CONFIG.fetchBatchSize)}: ${batch.join(", ")}`);

    const batchResults = await Promise.allSettled(
      batch.map((ticker) => fetchSingleStock(ticker))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }

    // Delay between batches to avoid rate limiting
    if (i + CONFIG.fetchBatchSize < tickers.length) {
      await sleep(CONFIG.fetchBatchDelayMs);
    }
  }

  if (results.length === 0) {
    throw new Error("No stock data could be fetched. Check your watchlist and internet connection.");
  }

  console.log(`Successfully fetched ${results.length}/${tickers.length} tickers`);
  return results;
}
