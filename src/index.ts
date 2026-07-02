import "dotenv/config";
import { CONFIG, ENV, type BriefingMeta, type MarketSnapshotEntry } from "./config.js";
import { readWatchlist } from "./watchlist.js";
import { fetchStockData } from "./data-fetcher.js";
import { filterStocks } from "./filter.js";
import { analyzeStocks } from "./analyzer.js";
import { buildMarketContext } from "./prompts.js";
import { buildEmailHtml } from "./email-builder.js";
import { sendBriefing } from "./emailer.js";
import { loadTracker, saveTracker, updateTracker, extractPicks, recordPicks, buildPerformanceSection } from "./tracker.js";

function shouldRun(): boolean {
  if (ENV.forceRun) {
    console.log("FORCE_RUN enabled — skipping schedule guard");
    return true;
  }

  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", {
    timeZone: CONFIG.timezone,
    weekday: "long",
  });

  // Friday & Saturday in ET = markets closed Sat & Sun
  if (dayName === "Friday" || dayName === "Saturday") {
    console.log(`Skipping: ${dayName} in ${CONFIG.timezone} — market is closed tomorrow`);
    return false;
  }

  return true;
}

async function main(): Promise<void> {
  console.log("=== Trading Agent ===\n");

  const k = process.env.ANTHROPIC_API_KEY ?? "";
  console.log(`API key fingerprint: ${k.slice(0, 7)}...${k.slice(-4)} (len=${k.length})  model=${CONFIG.claudeModel}`);

  if (!shouldRun()) {
    process.exit(0);
  }

  const startTime = Date.now();

  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    timeZone: CONFIG.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 1. Read watchlist
  const tickers = readWatchlist();

  // 2. Fetch market data
  console.log(`\nFetching data for ${tickers.length} tickers...`);
  const stocks = await fetchStockData(tickers);

  // 3. Pass 1: filter into per-section candidates
  console.log(`\nFiltering ${stocks.length} stocks into sections...`);
  const filtered = filterStocks(stocks);
  const sectionSummary = [...filtered.entries()]
    .map(([name, list]) => `${list.length} ${name}`)
    .join(", ");
  console.log(`  Filtered: ${sectionSummary}`);

  // Market snapshot strip + regime context, from already-fetched index data
  const snapshot: MarketSnapshotEntry[] = CONFIG.marketSnapshot.flatMap(({ ticker, label }) => {
    const s = stocks.find((x) => x.ticker === ticker);
    return s ? [{ label, changePct: s.dailyChangePercent }] : [];
  });
  const marketContext = buildMarketContext(stocks);

  // 4. Pass 2: parallel Claude calls per section
  console.log("\nAnalyzing with Claude...");
  const sections = await analyzeStocks(filtered, date, marketContext);

  // 5. Performance tracker: re-price open picks, close resolved ones,
  //    record tonight's picks, and build the email section
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.timezone }).format(now);
  const { state: trackerState, stats: trackerStats } = loadTracker();
  updateTracker(trackerState, trackerStats, stocks, todayISO);
  const performanceHtml = buildPerformanceSection(trackerState, todayISO);
  const newPicks = extractPicks(sections, stocks, todayISO);
  const added = recordPicks(trackerState, newPicks);
  console.log(`  Tracker: ${trackerState.open.length} open picks (${added} new), ${trackerState.closed.length} closed in window`);

  const generationTimeSeconds = (Date.now() - startTime) / 1000;

  const meta: BriefingMeta = {
    date,
    tickerCount: stocks.length,
    generationTimeSeconds,
  };

  // 6. Assemble email HTML
  const { html: fullHtml, setupCount } = buildEmailHtml(sections, meta, snapshot, performanceHtml);
  meta.setupCount = setupCount;

  // Persist tracker state (skipped on dry runs so testing stays idempotent)
  if (!ENV.dryRun) {
    saveTracker(trackerState, trackerStats);
  }

  // 7. Send or print
  if (ENV.dryRun) {
    console.log("\n--- DRY RUN: HTML Output ---\n");
    console.log(fullHtml);
    console.log(`\n--- Done in ${generationTimeSeconds.toFixed(1)}s ---`);
  } else {
    console.log("\nSending briefing email...");
    await sendBriefing(fullHtml, meta);
    console.log(`\nBriefing sent in ${generationTimeSeconds.toFixed(1)}s`);
  }
}

main().catch((error) => {
  console.error("\nFatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
