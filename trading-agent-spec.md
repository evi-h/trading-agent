# Trading Agent — Full Spec for Claude Code

## Overview
Build a Node.js / TypeScript agent that runs after market close (Sun–Thu evenings), fetches stock/ETF data for ~80 tickers, filters candidates in code, then sends only the best setups to Claude (in parallel API calls by section) for analysis. Results are combined into a styled HTML email briefing.

---

## Tech Stack
- **Runtime**: Node.js / TypeScript
- **Data source**: Yahoo Finance (`yahoo-finance2` npm package) — free, no API key
- **AI**: Claude API via `@anthropic-ai/sdk` (use `claude-sonnet-4-20250514`)
- **Email**: Gmail SMTP with App Password (`nodemailer`)

---

## Watchlist
- Loaded from a file (`watchlist.txt`) exported from TradingView
- TradingView exports one ticker per line — the agent reads this file on each run
- User re-exports from TradingView whenever they update their list
- Expect ~80 tickers
- If file is missing or empty, exit with a clear error message

---

## Data to Fetch (per ticker)
- **250 days** of daily OHLCV candle data (needed for SMA 200 + pattern detection buffer)
- Current price, daily change
- Volume (current + 20-day average)
- 52-week high/low
- Basic fundamentals if available (P/E, market cap, sector)

---

## Indicators to Calculate in Code (all 80 tickers)
- **RSI** (14-day)
- **SMA 150** — value + price distance from it (% above/below)
- **SMA 200** — value + price distance from it (% above/below)
- **Volume ratio** — today's volume vs 20-day average
- **Price change** — 1-day, 5-day, 1-month, 3-month percentages
- **52-week position** — where current price sits between 52w low and high

---

## Two-Pass Architecture (Token Optimization)

### Pass 1: Code-Level Filtering (strict)
Process all 80 tickers and filter down to ~10-15 candidates using strict thresholds. A ticker can qualify for multiple sections.

**Filter criteria (all calculated in code):**

| Section | Filter rule |
|---|---|
| SMA 150 setups | Price within ±3% of SMA 150, OR price just crossed above SMA 150 in last 5 days |
| SMA 200 setups | Price within ±3% of SMA 200, OR price just crossed above SMA 200 in last 5 days |
| Long-term setups | Price above both SMA 150 and SMA 200, 3-month trend positive, volume above average |
| Pattern candidates | Price made a rounded bottom over 4–8 weeks (potential cup), OR has a clear left-shoulder + head formation — use heuristic detection, doesn't need to be perfect, Claude will validate |
| RSI signals | RSI < 30 (oversold) OR RSI > 70 (overbought) |

Tickers that don't match any filter are silently excluded — they don't get sent to Claude at all.

### Pass 2: Parallel Claude API Calls
Send filtered candidates to Claude in **5 separate parallel API calls**, one per section. This keeps each call's context small and lets them run simultaneously.

| API Call | Input sent to Claude | What Claude does |
|---|---|---|
| **Call 1: SMA 150** | Filtered tickers + computed indicators (RSI, SMA values, price changes, volume). NO raw candles. | Analyze the setup, suggest entry/stop/exit with partial exits |
| **Call 2: SMA 200** | Same format — indicators only, no candles | Analyze the setup, suggest entry/stop/exit with partial exits |
| **Call 3: Long-term** | Same format — indicators only, no candles | Broader trend analysis, entry/stop/exit with partial exits |
| **Call 4: Patterns** | Filtered tickers + **raw OHLCV candle data** (this is the only call that needs candles) | Detect and validate cup & handle, head & shoulders (including inverse). Suggest entry/stop/exit |
| **Call 5: RSI** | Filtered tickers + indicators, no candles | Flag oversold opportunities and overbought warnings, suggest entry/stop/exit |

**Important:** A ticker CAN appear in multiple calls if it qualifies for multiple sections. That's fine — the trader wants to see it from each angle.

**If a section has zero candidates after filtering**, skip that API call entirely (save tokens + time).

### Token Budget Estimate
- Calls 1, 2, 3, 5: ~1-3K input tokens each (just indicators for a few tickers)
- Call 4 (patterns): ~5-10K input tokens (candle data for ~5-10 tickers)
- Total per run: ~10-20K input, ~3-5K output
- **Estimated cost per run: $0.02–$0.05**
- **Monthly cost (~22 runs): ~$0.50–$1.10**

---

## Claude's Analysis Job (applies to all 5 calls)

Each call gets a section-specific system prompt, but the output rules are the same:

1. **Flag setups only** — no buy/sell/hold verdicts. The trader decides.

2. **For each flagged setup, always include:**
   - Ticker + company name
   - One-liner description of the setup
   - Signal strength (1–5 scale)
   - Signal type: Bullish / Forming / Caution (mapped to green / yellow / red)
   - **Entry zone** (price range)
   - **Stop loss** level with reasoning
   - **Exit plan** with partial exits (e.g. "take 50% at $X, trail remaining with stop at $Y")
   - The exit strategy type should be chosen per setup — could be fixed target, trailing stop, or a combination — whatever fits the pattern best

3. **Up to 5 picks per section** — fewer is fine. Only flag genuinely good setups.

4. **Output format**: Each call returns an HTML fragment (just the section cards, no full page wrapper). The agent combines all fragments into the final email template.

---

## Email Design Spec

### Overall
- Dark theme: background `#1a1a2e`, cards `#16213e`
- Max width 640px, centered
- Font: system sans-serif stack
- Text color: `#e0e0e0` body, `#fff` for tickers, `#888` for secondary text

### Header
- "EVENING BRIEFING" label (small, uppercase, muted)
- Date in large text
- Ticker count scanned + generation time

### Section Headers
- Uppercase, letter-spaced, color `#9b9bce`
- Separates each category (SMA 150, SMA 200, Long-term, Cup & Handle, Head & Shoulders, RSI)
- Only render sections that have picks — skip empty sections entirely

### Setup Cards
- Background `#16213e`, border-radius 10px, padding 16px 18px
- **Left border (3px)** color-coded by signal type:
  - Green `#0f9b58` = Bullish
  - Yellow `#f9a825` = Forming / Watch
  - Red `#e53935` = Caution / Overbought
- **Top row**: Ticker (17px, bold, white) + company name (12px, muted) on left. Signal badge + strength meter on right.
- **Signal badge**: small pill with text + background matching signal color at 15% opacity
- **Strength meter**: 5 vertical bars of increasing height (12px to 28px), filled bars use signal color, unfilled are `#333`
- **Description**: 13px, `#bbb`, 1–2 sentences max
- **Bottom row**: three columns — Entry zone, Stop loss (red), Exit plan (green) with partial exit levels
  - Labels: 10px uppercase `#666`
  - Values: 14px, weight 500

### Footer
- Disclaimer: "AI-generated analysis for informational purposes only. Not financial advice. Always do your own research."
- "Powered by Claude" + generation time

---

## Combining the Email

The agent (in code, not Claude) handles:
1. Building the full HTML email template (header, footer, wrapper)
2. Inserting each section's HTML fragment from the parallel Claude calls in order:
   - SMA 150 setups
   - SMA 200 setups
   - Long-term setups
   - Cup & handle patterns
   - Head & shoulders patterns
   - RSI signals
3. Skipping any section that returned zero picks
4. Adding section headers between fragments
5. Wrapping everything in the email-safe HTML template

---

## Schedule
- Runs **Sunday through Thursday** evenings after market close
- **Does NOT run Friday or Saturday** (market closed Sat/Sun)
- Day-of-week guard in code:
  - Check current day in America/New_York timezone
  - Skip if Friday or Saturday
  - `FORCE_RUN=true` environment variable overrides the guard for testing
- `DRY_RUN=true` → fetch + analyze but print to console instead of emailing
- Actual cron/scheduler is set up separately (README should include cron + GitHub Actions examples)

---

## Project Structure

```
trading-agent/
├── src/
│   ├── index.ts          # entry point, schedule guard, orchestration
│   ├── config.ts         # all tuneable params (strategy thresholds, email, schedule)
│   ├── watchlist.ts      # reads + parses TradingView export .txt file
│   ├── data-fetcher.ts   # Yahoo Finance OHLCV + quote data for all tickers
│   ├── indicators.ts     # RSI, SMA 150, SMA 200, volume ratio calculations
│   ├── filter.ts         # Pass 1: strict filtering of 80 → ~15 candidates per section
│   ├── analyzer.ts       # Pass 2: parallel Claude API calls (one per section)
│   ├── prompts.ts        # System + user prompts for each section type
│   ├── email-builder.ts  # Combines HTML fragments into final email template
│   └── emailer.ts        # nodemailer Gmail SMTP sender
├── watchlist.txt          # TradingView export goes here (one ticker per line)
├── .env.example           # ANTHROPIC_API_KEY, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO
├── package.json
├── tsconfig.json
└── README.md              # setup, usage, cron examples, customization guide
```

---

## Config Defaults

| Parameter            | Default   | Notes                                |
|----------------------|----------:|--------------------------------------|
| RSI period           |        14 | Standard                             |
| RSI oversold         |        30 | Flag as opportunity                  |
| RSI overbought       |        70 | Flag as caution                      |
| SMA short            |       150 | days                                 |
| SMA long             |       200 | days                                 |
| SMA proximity        |        3% | price within ±3% of SMA to qualify   |
| SMA crossover window |    5 days | detect recent crossovers             |
| Historical days      |       250 | ~1 year of candles for patterns      |
| Min avg volume       |   500,000 | Filter out illiquid tickers          |
| Max picks per section|         5 | Claude returns at most 5 per section |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # Gmail App Password
EMAIL_FROM=you@gmail.com
EMAIL_TO=you@gmail.com
FORCE_RUN=false
DRY_RUN=false
```

---

## README Should Include
- Quick start (install, configure .env, test with dry-run)
- How to export watchlist from TradingView (right-click list → Export)
- Architecture diagram showing the two-pass pipeline
- Cost estimate per run (~$0.02–$0.05)
- Cron job setup (with timezone-aware example for 6:30 PM ET, Sun–Thu)
- GitHub Actions workflow YAML for serverless scheduling
- How to customize: add tickers, tune filter thresholds, modify Claude's prompts
- Disclaimer about not being financial advice
