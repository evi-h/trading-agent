import "dotenv/config";
import { CONFIG, ENV } from "./config.js";
import { readWatchlist } from "./watchlist.js";
import { fetchStockData } from "./data-fetcher.js";
import { filterStocks } from "./filter.js";
import { analyzeStocks } from "./analyzer.js";
import { buildEmailHtml } from "./email-builder.js";
import { sendBriefing } from "./emailer.js";

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

  // 4. Pass 2: parallel Claude calls per section
  console.log("\nAnalyzing with Claude...");
  const sections = await analyzeStocks(filtered, date);

  const generationTimeSeconds = (Date.now() - startTime) / 1000;

  const meta = {
    date,
    tickerCount: stocks.length,
    generationTimeSeconds,
  };

  // 5. Assemble email HTML
  const fullHtml = buildEmailHtml(sections, meta);

  // 6. Send or print
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
