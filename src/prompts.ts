import { type EnrichedStock } from "./config.js";

// ---------------------------------------------------------------------------
// Shared output rules appended to every section system prompt
// ---------------------------------------------------------------------------

const SHARED_RULES = `
FOR EACH SETUP PROVIDE:
- Ticker and company name
- 1-2 sentence description of the setup
- Signal type: "Bullish" (green), "Forming" (yellow), or "Caution" (red)
- Signal strength: 1 to 5
- Entry zone: specific price range
- Stop loss: specific price with brief reasoning
- Exit plan: partial exit strategy with specific levels (e.g. "50% at $X, trail rest with stop at $Y")

QUALITY OVER QUANTITY: Only flag setups you're genuinely confident about. Up to 5 picks max. If no setup meets your criteria, return an empty string (nothing at all).

EXIT STRATEGY GUIDANCE — choose per setup:
- Breakout / momentum setups → trailing stop (e.g. trail with 20-day low or ATR-based)
- Mean-reversion / oversold bounce → fixed price target
- Pattern completion (cup & handle, H&S) → combo: partial exit at measured move, trail remainder
- Every setup MUST have a defined exit — never "hold indefinitely"

ENTRY / STOP / EXIT QUALITY RULES:
- Entry zone: tight range (1–3% wide) near current price, not a vague band
- Stop loss: must cite a technical reason (e.g. "below SMA 150", "below handle low", "below neckline") — not just a round number
- Exit plan: must include at least one partial exit with position sizing (e.g. "50% at $X")

OUTPUT: Return ONLY raw HTML. No markdown, no code fences, no explanation. Start with the section header, then the cards.

SECTION HEADER TEMPLATE:
<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9b9bce;margin:28px 0 12px;font-weight:600;">SECTION NAME</div>

SETUP CARD TEMPLATE (replace all {placeholders}):
<div style="background:#16213e;border-radius:10px;padding:16px 18px;margin-bottom:10px;border-left:3px solid {borderColor};">
<div style="display:flex;justify-content:space-between;align-items:center;">
<div><span style="font-size:17px;font-weight:700;color:#fff;">{TICKER}</span><span style="font-size:12px;color:#888;margin-left:8px;">{Company Name}</span></div>
<div style="display:flex;align-items:center;gap:8px;">
<span style="font-size:10px;padding:3px 8px;border-radius:10px;color:{signalColor};background:{signalColorBg};">{SignalType}</span>
<div style="display:flex;align-items:flex-end;gap:2px;">{strengthBars}</div>
</div>
</div>
<div style="font-size:13px;color:#bbb;margin:10px 0;">{description}</div>
<div style="display:flex;gap:16px;margin-top:12px;">
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Entry Zone</div><div style="font-size:14px;font-weight:500;color:#e0e0e0;">{entryZone}</div></div>
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Stop Loss</div><div style="font-size:14px;font-weight:500;color:#e53935;">{stopLoss}</div></div>
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Exit Plan</div><div style="font-size:14px;font-weight:500;color:#0f9b58;">{exitPlan}</div></div>
</div>
</div>

COLOR MAPPING:
- Bullish: borderColor="#0f9b58", signalColor="#0f9b58", signalColorBg="rgba(15,155,88,0.15)"
- Forming: borderColor="#f9a825", signalColor="#f9a825", signalColorBg="rgba(249,168,37,0.15)"
- Caution: borderColor="#e53935", signalColor="#e53935", signalColorBg="rgba(229,57,53,0.15)"

STRENGTH BARS: 5 vertical bars with increasing heights (12px, 16px, 20px, 24px, 28px). Width 4px each.
- Filled bar (index < strength): background:{signalColor};border-radius:1px;
- Unfilled bar (index >= strength): background:#333;border-radius:1px;

Example for strength 3 with Bullish color:
<div style="width:4px;height:12px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:16px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:20px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:24px;background:#333;border-radius:1px;"></div><div style="width:4px;height:28px;background:#333;border-radius:1px;"></div>

FILLED EXAMPLE (for reference — do not copy verbatim, use real data for each setup):
<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9b9bce;margin:28px 0 12px;font-weight:600;">SMA 150 SETUPS</div>
<div style="background:#16213e;border-radius:10px;padding:16px 18px;margin-bottom:10px;border-left:3px solid #0f9b58;">
<div style="display:flex;justify-content:space-between;align-items:center;">
<div><span style="font-size:17px;font-weight:700;color:#fff;">AAPL</span><span style="font-size:12px;color:#888;margin-left:8px;">Apple Inc.</span></div>
<div style="display:flex;align-items:center;gap:8px;">
<span style="font-size:10px;padding:3px 8px;border-radius:10px;color:#0f9b58;background:rgba(15,155,88,0.15);">Bullish</span>
<div style="display:flex;align-items:flex-end;gap:2px;"><div style="width:4px;height:12px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:16px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:20px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:24px;background:#0f9b58;border-radius:1px;"></div><div style="width:4px;height:28px;background:#333;border-radius:1px;"></div></div>
</div>
</div>
<div style="font-size:13px;color:#bbb;margin:10px 0;">Bouncing off 150-day SMA with rising volume. Higher low forming above prior support at $178, suggesting institutional accumulation at this level.</div>
<div style="display:flex;gap:16px;margin-top:12px;">
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Entry Zone</div><div style="font-size:14px;font-weight:500;color:#e0e0e0;">$180.50–$183.00</div></div>
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Stop Loss</div><div style="font-size:14px;font-weight:500;color:#e53935;">$175.80 (below SMA 150 &amp; swing low)</div></div>
<div style="flex:1;"><div style="font-size:10px;text-transform:uppercase;color:#666;">Exit Plan</div><div style="font-size:14px;font-weight:500;color:#0f9b58;">50% at $192, trail rest with stop at 20-day low</div></div>
</div>
</div>`;

// ---------------------------------------------------------------------------
// Indicator-only user message (no OHLCV candles)
// ---------------------------------------------------------------------------

function formatVolume(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

function formatNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function buildIndicatorLines(stocks: EnrichedStock[], date: string): string {
  const lines: string[] = [
    `Date: ${date}`,
    `Tickers: ${stocks.length}`,
    "",
    "=== STOCK DATA (indicators only) ===",
  ];

  for (const s of stocks) {
    const ind = s.indicators;
    lines.push("");
    lines.push(`--- ${s.ticker} (${s.companyName}) ---`);
    lines.push(`Sector: ${s.sector} | Price: $${s.currentPrice.toFixed(2)} | Change 1d: ${s.dailyChangePercent >= 0 ? "+" : ""}${s.dailyChangePercent.toFixed(2)}%`);
    lines.push(`Change 5d: ${ind.priceChange5d >= 0 ? "+" : ""}${ind.priceChange5d.toFixed(2)}% | 1m: ${ind.priceChange1m >= 0 ? "+" : ""}${ind.priceChange1m.toFixed(2)}% | 3m: ${ind.priceChange3m >= 0 ? "+" : ""}${ind.priceChange3m.toFixed(2)}%`);
    lines.push(`Volume: ${formatVolume(s.volume)} | Avg: ${formatVolume(s.avgVolume20d)} | Vol ratio: ${ind.volumeRatio.toFixed(2)}x`);
    lines.push(`52W: $${s.low52w.toFixed(2)}–$${s.high52w.toFixed(2)} | Position: ${(ind.weekPosition52 * 100).toFixed(0)}%`);
    lines.push(`P/E: ${s.peRatio?.toFixed(1) ?? "N/A"} | MCap: ${s.marketCap ? formatNumber(s.marketCap) : "N/A"}`);
    lines.push(`RSI(14): ${ind.rsi}${ind.rsiSignal ? ` [${ind.rsiSignal.toUpperCase()}]` : ""} | SMA150: ${ind.sma150 ? `$${ind.sma150.toFixed(2)} (${ind.priceVsSma150})` : "N/A"} | SMA200: ${ind.sma200 ? `$${ind.sma200.toFixed(2)} (${ind.priceVsSma200})` : "N/A"}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// SMA 150
// ---------------------------------------------------------------------------

export const sma150SystemPrompt = `You are a technical chart analyst. You have received stocks pre-filtered by code to have price within ±3% of their 150-day SMA, or that recently crossed above it.

YOUR JOB: Identify the best SMA 150 setups — stocks bouncing off, using as support/resistance, or showing a meaningful crossover.

Flag setups only — NEVER give buy/sell/hold verdicts. The trader decides.
${SHARED_RULES}`;

export function buildSma150UserMessage(stocks: EnrichedStock[], date: string): string {
  return buildIndicatorLines(stocks, date);
}

// ---------------------------------------------------------------------------
// SMA 200
// ---------------------------------------------------------------------------

export const sma200SystemPrompt = `You are a technical chart analyst. You have received stocks pre-filtered by code to have price within ±3% of their 200-day SMA, or that recently crossed above it.

YOUR JOB: Identify the best SMA 200 setups — stocks bouncing off, using as support/resistance, or showing a meaningful crossover. The 200-day SMA is a key institutional level.

Flag setups only — NEVER give buy/sell/hold verdicts. The trader decides.
${SHARED_RULES}`;

export function buildSma200UserMessage(stocks: EnrichedStock[], date: string): string {
  return buildIndicatorLines(stocks, date);
}

// ---------------------------------------------------------------------------
// Long-term
// ---------------------------------------------------------------------------

export const longtermSystemPrompt = `You are a technical chart analyst. You have received stocks pre-filtered by code: price is above both SMA 150 and SMA 200, 3-month trend is positive, and volume is above average.

YOUR JOB: Identify the best long-term positioning setups — stocks showing strong trend structure with good risk/reward for a multi-week to multi-month hold.

Flag setups only — NEVER give buy/sell/hold verdicts. The trader decides.
${SHARED_RULES}`;

export function buildLongtermUserMessage(stocks: EnrichedStock[], date: string): string {
  return buildIndicatorLines(stocks, date);
}

// ---------------------------------------------------------------------------
// Patterns (Cup & Handle + Head & Shoulders) — includes OHLCV candles
// ---------------------------------------------------------------------------

export const patternsSystemPrompt = `You are a technical chart analyst specializing in chart pattern recognition. You have received stocks pre-filtered by a heuristic detector as potential cup & handle or head & shoulders candidates. The heuristics are imperfect — your job is to validate and pick only the genuinely high-quality patterns.

YOUR JOB: Detect and validate these pattern types:
1. CUP & HANDLE — rounded base (the cup) followed by a smaller consolidation near the rim (the handle), with breakout potential above the handle high.
2. HEAD & SHOULDERS (bearish) — three peaks where the middle peak (head) is highest, connected by a relatively flat neckline. Signals potential reversal downward.
3. INVERSE HEAD & SHOULDERS (bullish) — three troughs where the middle trough (head) is deepest, connected by a relatively flat neckline. Signals potential reversal upward.

OUTPUT STRUCTURE — follow these steps:
1. If you find cup & handle picks, output them under the section header "CUP & HANDLE PATTERNS"
2. If you find head & shoulders picks (regular OR inverse), output them under the section header "HEAD & SHOULDERS PATTERNS". Use signal type "Caution" for regular H&S and "Bullish" for inverse H&S.
3. Only include section headers for pattern types that have picks. If neither type has picks, return an empty string.

Flag setups only — NEVER give buy/sell/hold verdicts. The trader decides.
${SHARED_RULES}`;

export function buildPatternsUserMessage(stocks: EnrichedStock[], date: string): string {
  const lines: string[] = [
    `Date: ${date}`,
    `Tickers: ${stocks.length}`,
    "",
    "=== STOCK DATA (indicators + OHLCV candles) ===",
  ];

  for (const s of stocks) {
    const ind = s.indicators;
    lines.push("");
    lines.push(`--- ${s.ticker} (${s.companyName}) ---`);
    lines.push(`Sector: ${s.sector} | Price: $${s.currentPrice.toFixed(2)}`);
    lines.push(`RSI(14): ${ind.rsi} | SMA150: ${ind.sma150 ? `$${ind.sma150.toFixed(2)} (${ind.priceVsSma150})` : "N/A"} | SMA200: ${ind.sma200 ? `$${ind.sma200.toFixed(2)} (${ind.priceVsSma200})` : "N/A"}`);
    lines.push(`52W: $${s.low52w.toFixed(2)}–$${s.high52w.toFixed(2)} | Position: ${(ind.weekPosition52 * 100).toFixed(0)}%`);

    const recentCandles = s.candles.slice(-90);
    lines.push("");
    lines.push("OHLCV (date|open|high|low|close|volume):");
    for (const c of recentCandles) {
      lines.push(`${c.date}|${c.open.toFixed(2)}|${c.high.toFixed(2)}|${c.low.toFixed(2)}|${c.close.toFixed(2)}|${c.volume}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

export const rsiSystemPrompt = `You are a technical chart analyst. You have received stocks pre-filtered by code to have RSI below 30 (oversold) or above 70 (overbought).

YOUR JOB: Flag the best RSI signals — oversold stocks showing potential reversal opportunity, and overbought stocks that may be at risk of a pullback.

Flag setups only — NEVER give buy/sell/hold verdicts. The trader decides.
${SHARED_RULES}`;

export function buildRsiUserMessage(stocks: EnrichedStock[], date: string): string {
  return buildIndicatorLines(stocks, date);
}
