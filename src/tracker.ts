import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, ENV, type EnrichedStock, type SectionName } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PickOutcome = "target_hit" | "stopped_out" | "expired";

export interface OpenPick {
  ticker: string;
  section: SectionName;
  signal: string;            // Bullish | Forming | Caution
  flaggedDate: string;       // YYYY-MM-DD (ET)
  flaggedPrice: number;      // close on the day the pick was flagged
  entryLow: number;
  entryHigh: number;
  stop: number;
  target: number | null;     // first partial-exit target; null for pure trailing exits
  lastPrice: number;
  lastUpdated: string;
  daysTracked: number;       // trading days seen since flagged
}

export interface ClosedPick {
  ticker: string;
  section: SectionName;
  signal: string;
  flaggedDate: string;
  closedDate: string;
  outcome: PickOutcome;
  returnPct: number;         // flaggedPrice → close price
  daysHeld: number;
}

interface StatsBucket {
  picks: number;
  wins: number;              // returnPct > 0
  sumReturnPct: number;      // keep the sum so merges stay exact
}

export interface MonthlyStats {
  month: string;             // YYYY-MM
  total: StatsBucket;
  bySection: Partial<Record<SectionName, StatsBucket>>;
}

export interface TrackerState {
  version: 1;
  open: OpenPick[];
  closed: ClosedPick[];
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

const EMPTY_STATE: TrackerState = { version: 1, open: [], closed: [] };

export function loadTracker(): { state: TrackerState; stats: MonthlyStats[] } {
  const dir = ENV.trackerDataDir;
  let state = EMPTY_STATE;
  let stats: MonthlyStats[] = [];

  try {
    state = JSON.parse(readFileSync(join(dir, "picks.json"), "utf-8")) as TrackerState;
  } catch {
    console.log("  Tracker: no picks.json found, starting fresh");
  }
  try {
    stats = JSON.parse(readFileSync(join(dir, "stats.json"), "utf-8")) as MonthlyStats[];
  } catch {
    // stats file optional
  }

  return { state, stats };
}

export function saveTracker(state: TrackerState, stats: MonthlyStats[]): void {
  const dir = ENV.trackerDataDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "picks.json"), JSON.stringify(state, null, 1) + "\n");
  writeFileSync(join(dir, "stats.json"), JSON.stringify(stats, null, 1) + "\n");
}

// ---------------------------------------------------------------------------
// Extract tonight's picks from the section HTML Claude produced
// ---------------------------------------------------------------------------

function parseDollars(s: string): number[] {
  return (s.match(/\$([0-9][0-9,]*(?:\.[0-9]+)?)/g) || [])
    .map((m) => parseFloat(m.slice(1).replace(/,/g, "")));
}

function fieldValue(card: string, label: string): string {
  const m = card.match(new RegExp(`${label}</div><div[^>]*>(.*?)</div>`, "s"));
  return m ? m[1] : "";
}

/**
 * Parse setup cards out of the HTML fragments. The card template is ours,
 * so the structure is stable; cards that don't parse are skipped with a
 * warning rather than failing the run.
 */
export function extractPicks(
  sections: Map<SectionName, string>,
  stocks: EnrichedStock[],
  today: string
): OpenPick[] {
  const picks: OpenPick[] = [];

  for (const [section, html] of sections.entries()) {
    // Split on the exact card-template signature (failure fragments differ)
    const chunks = html.split(/(?=background:#16213e;border-radius:10px;padding:16px 18px)/).slice(1);

    for (const card of chunks) {
      const tickerMatch = card.match(/font-size:17px;font-weight:700;color:#fff;">([^<]+)</);
      const signalMatch = card.match(/>(Bullish|Forming|Caution)<\/span>/);
      const entryNums = parseDollars(fieldValue(card, "Entry Zone"));
      const stopNums = parseDollars(fieldValue(card, "Stop Loss"));
      const exitNums = parseDollars(fieldValue(card, "Exit Plan"));

      if (!tickerMatch || !signalMatch || entryNums.length === 0 || stopNums.length === 0) {
        console.warn(`  Tracker: could not parse a ${section} card, skipping`);
        continue;
      }

      const ticker = tickerMatch[1].trim();
      const stock = stocks.find((s) => s.ticker === ticker);
      if (!stock) {
        console.warn(`  Tracker: ${ticker} not in fetched data, skipping`);
        continue;
      }

      picks.push({
        ticker,
        section,
        signal: signalMatch[1],
        flaggedDate: today,
        flaggedPrice: stock.currentPrice,
        entryLow: Math.min(entryNums[0], entryNums[1] ?? entryNums[0]),
        entryHigh: Math.max(entryNums[0], entryNums[1] ?? entryNums[0]),
        stop: stopNums[0],
        target: exitNums[0] ?? null,
        lastPrice: stock.currentPrice,
        lastUpdated: today,
        daysTracked: 0,
      });
    }
  }

  return picks;
}

/** Add tonight's picks, skipping any ticker+section already being tracked. */
export function recordPicks(state: TrackerState, picks: OpenPick[]): number {
  let added = 0;
  for (const pick of picks) {
    const dup = state.open.some((p) => p.ticker === pick.ticker && p.section === pick.section);
    if (!dup) {
      state.open.push(pick);
      added++;
    }
  }
  return added;
}

// ---------------------------------------------------------------------------
// Nightly update: re-price, close, aggregate, prune
// ---------------------------------------------------------------------------

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000);
}

function bucket(): StatsBucket {
  return { picks: 0, wins: 0, sumReturnPct: 0 };
}

function addToBucket(b: StatsBucket, pick: ClosedPick): void {
  b.picks++;
  if (pick.returnPct > 0) b.wins++;
  b.sumReturnPct += pick.returnPct;
}

export function updateTracker(
  state: TrackerState,
  stats: MonthlyStats[],
  stocks: EnrichedStock[],
  today: string
): void {
  const stillOpen: OpenPick[] = [];

  for (const pick of state.open) {
    const stock = stocks.find((s) => s.ticker === pick.ticker);

    if (stock) {
      pick.lastPrice = stock.currentPrice;
      pick.lastUpdated = today;
      pick.daysTracked++;
    }
    // Note: closes are daily — "stopped_out" means closed below the stop,
    // not an intraday touch, so results read slightly better than real fills

    let outcome: PickOutcome | null = null;
    if (pick.target !== null && pick.lastPrice >= pick.target) outcome = "target_hit";
    else if (pick.lastPrice <= pick.stop) outcome = "stopped_out";
    else if (
      pick.daysTracked >= CONFIG.trackerMaxOpenTradingDays ||
      daysBetween(pick.flaggedDate, today) >= CONFIG.trackerMaxOpenCalendarDays
    ) outcome = "expired";

    if (outcome) {
      state.closed.push({
        ticker: pick.ticker,
        section: pick.section,
        signal: pick.signal,
        flaggedDate: pick.flaggedDate,
        closedDate: today,
        outcome,
        returnPct: Math.round(((pick.lastPrice - pick.flaggedPrice) / pick.flaggedPrice) * 10000) / 100,
        daysHeld: pick.daysTracked,
      });
    } else {
      stillOpen.push(pick);
    }
  }

  state.open = stillOpen;

  // Retention: fold closed picks older than the window into monthly stats,
  // then drop the detail — this is what keeps the file size flat forever
  const keep: ClosedPick[] = [];
  for (const pick of state.closed) {
    if (daysBetween(pick.closedDate, today) <= CONFIG.trackerClosedRetentionDays) {
      keep.push(pick);
      continue;
    }
    const month = pick.closedDate.slice(0, 7);
    let entry = stats.find((m) => m.month === month);
    if (!entry) {
      entry = { month, total: bucket(), bySection: {} };
      stats.push(entry);
    }
    addToBucket(entry.total, pick);
    addToBucket((entry.bySection[pick.section] ??= bucket()), pick);
  }
  state.closed = keep;
  stats.sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// Email section
// ---------------------------------------------------------------------------

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function pickStatus(pick: OpenPick): string {
  if (pick.target !== null && pick.lastPrice >= pick.target * 0.97) return "near target";
  if (pick.lastPrice > pick.entryHigh) return "above entry";
  if (pick.lastPrice >= pick.entryLow) return "in entry zone";
  return "stop not hit";
}

export function buildPerformanceSection(state: TrackerState, today: string): string {
  // Tonight's picks have nothing to report yet — show earlier ones only
  const tracked = state.open
    .filter((p) => p.flaggedDate !== today)
    .sort((a, b) => b.flaggedDate.localeCompare(a.flaggedDate));

  const recentClosed = state.closed.filter((p) => daysBetween(p.closedDate, today) <= 30);

  if (tracked.length === 0 && recentClosed.length === 0) return "";

  const shown = tracked.slice(0, 12);
  const rows = shown.map((pick, i) => {
    const ret = ((pick.lastPrice - pick.flaggedPrice) / pick.flaggedPrice) * 100;
    const color = ret >= 0 ? "#2d8659" : "#e57373";
    const border = i === 0 ? "" : "border-top:1px solid #23305a;";
    return `<tr style="${border}"><td style="color:#fff;padding:6px 0;font-size:12px;">${pick.ticker} <span style="color:#666;font-size:11px;">flagged ${shortDate(pick.flaggedDate)}</span></td><td style="text-align:right;color:${color};font-size:12px;">${ret >= 0 ? "+" : ""}${ret.toFixed(1)}% &middot; ${pickStatus(pick)}</td></tr>`;
  });

  const moreNote = tracked.length > shown.length
    ? `<div style="font-size:11px;color:#666;margin-top:8px;">+${tracked.length - shown.length} more tracked</div>`
    : "";

  let summary = "";
  if (recentClosed.length > 0) {
    const wins = recentClosed.filter((p) => p.returnPct > 0).length;
    const avg = recentClosed.reduce((sum, p) => sum + p.returnPct, 0) / recentClosed.length;
    summary = `<div style="font-size:11px;color:#888;margin-top:10px;padding-top:10px;border-top:1px solid #23305a;">Last 30 days: ${recentClosed.length} closed &middot; ${Math.round((wins / recentClosed.length) * 100)}% winners &middot; avg ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%</div>`;
  }

  const table = rows.length > 0
    ? `<table style="width:100%;border-collapse:collapse;">${rows.join("")}</table>`
    : `<div style="font-size:12px;color:#888;">No open picks being tracked.</div>`;

  return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9b9bce;margin:28px 0 12px;font-weight:600;">HOW PAST PICKS ARE DOING</div>
<div style="background:#16213e;border-radius:10px;padding:12px 18px;">${table}${moreNote}${summary}</div>`;
}
