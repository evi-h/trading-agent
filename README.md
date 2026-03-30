# Trading Agent

Post-market technical analysis briefing powered by Claude. Runs after market close, fetches stock data, detects chart patterns, and emails a styled HTML briefing with flagged setups.

> **Disclaimer:** AI-generated analysis for informational purposes only. Not financial advice. Always do your own research.

## Architecture

```
watchlist.txt → [Watchlist Reader] → [Yahoo Finance Fetcher] → [Indicator Calculator]
                                                                        ↓
                                                              [Claude Analyzer]
                                                                        ↓
                                                               [Email Sender]
                                                                        ↓
                                                            Styled HTML Briefing
```

**What Claude analyzes:**
- SMA 150/200 interactions (support, resistance, crossovers)
- Cup & handle formations
- Head & shoulders patterns (including inverse)
- RSI oversold/overbought signals
- Long-term trend setups

Each flagged setup includes: entry zone, stop loss, and exit plan with partial exits.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail App Password ([create one here](https://myaccount.google.com/apppasswords)) |
| `EMAIL_FROM` | Sender email |
| `EMAIL_TO` | Recipient email |

### 3. Set up your watchlist

Export from TradingView: **Watchlist panel → ⋮ menu → Export list**. Save as `watchlist.txt` in the project root. Format is one ticker per line:

```
AAPL
MSFT
NVDA
```

### 4. Test with dry run

```bash
npm run dry-run
```

This fetches data and runs Claude analysis but prints the HTML to console instead of emailing.

### 5. Run for real

```bash
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Claude API key |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | Required. SMTP username |
| `SMTP_PASS` | — | Required. SMTP password / app password |
| `EMAIL_FROM` | — | Required. Sender address |
| `EMAIL_TO` | — | Required. Recipient address |
| `FORCE_RUN` | `false` | Override day-of-week guard |
| `DRY_RUN` | `false` | Print HTML instead of emailing |

## Schedule

The agent includes a built-in day-of-week guard:
- **Runs:** Sunday through Thursday evenings (covers Mon–Fri market days)
- **Skips:** Friday and Saturday (market closed Sat/Sun)
- **Override:** Set `FORCE_RUN=true` to run any day

### Cron Job (macOS/Linux)

Run every weekday at 5:00 PM Eastern:

```bash
# Edit crontab
crontab -e

# Add this line (adjust path):
0 17 * * 0-4 cd /path/to/trading-agent && /usr/local/bin/node dist/index.js >> /tmp/trading-agent.log 2>&1
```

> Note: Build first with `npm run build`. The cron schedule is `0-4` = Sun-Thu. The agent's own guard provides a second safety check.

### GitHub Actions (Free Serverless)

Create `.github/workflows/briefing.yml`:

```yaml
name: Evening Briefing

on:
  schedule:
    # 9:30 PM UTC = 5:30 PM ET (Sun-Thu)
    - cron: '30 21 * * 0-4'
  workflow_dispatch: # Manual trigger

jobs:
  briefing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: node dist/index.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          EMAIL_FROM: ${{ secrets.EMAIL_FROM }}
          EMAIL_TO: ${{ secrets.EMAIL_TO }}
          FORCE_RUN: 'true'
```

Add your secrets in **Settings → Secrets and variables → Actions**.

GitHub Actions is free for public repos and includes 2,000 minutes/month for private repos. This workflow uses ~2-3 minutes per run.

## Customization

### Tune thresholds

Edit `src/config.ts`:

```typescript
export const CONFIG = {
  rsiPeriod: 14,       // RSI lookback period
  rsiOversold: 30,     // Flag as opportunity below this
  rsiOverbought: 70,   // Flag as caution above this
  smaShort: 150,       // Short-term SMA (days)
  smaLong: 200,        // Long-term SMA (days)
  historicalDays: 250,  // ~1 year of candle data
  minAvgVolume: 500_000, // Filter illiquid tickers
};
```

### Modify Claude's analysis

Edit the `SYSTEM_PROMPT` in `src/analyzer.ts` to add new pattern types, change output format, or adjust analysis focus.

## Project Structure

```
trading-agent/
├── src/
│   ├── index.ts          # Entry point, schedule guard, orchestration
│   ├── config.ts         # Tuneable params, env vars, types
│   ├── watchlist.ts      # Reads TradingView export
│   ├── data-fetcher.ts   # Yahoo Finance API (OHLCV + quote data)
│   ├── indicators.ts     # RSI (Wilder), SMA 150, SMA 200
│   ├── analyzer.ts       # Claude API call + system prompt
│   └── emailer.ts        # Gmail SMTP + HTML email template
├── watchlist.txt          # Your TradingView export (one ticker/line)
├── .env.example           # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```
# trading-agent
