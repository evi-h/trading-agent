import { type BriefingMeta, type SectionName } from "./config.js";

// Ordered sections as they should appear in the email
const SECTION_ORDER: SectionName[] = ["sma150", "sma200", "longterm", "patterns", "rsi"];

function validateSectionHtml(section: SectionName, html: string): void {
  // Card count: each card uses the card background color
  const cardCount = (html.match(/background:#16213e/g) || []).length;
  if (cardCount === 0) {
    console.warn(`  [${section}] Warning: no setup cards found in Claude output`);
  }

  // Required fields per card
  for (const field of ["Entry Zone", "Stop Loss", "Exit Plan"]) {
    const fieldCount = (html.match(new RegExp(field, "g")) || []).length;
    if (fieldCount < cardCount) {
      console.warn(`  [${section}] Warning: only ${fieldCount}/${cardCount} cards have "${field}"`);
    }
  }

  // Div balance
  const opens = (html.match(/<div/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  if (opens !== closes) {
    console.warn(`  [${section}] Warning: unbalanced divs (${opens} opens, ${closes} closes)`);
  }

  // Section header presence
  if (!html.includes("letter-spacing:2px")) {
    console.warn(`  [${section}] Warning: missing section header`);
  }
}

export function buildEmailHtml(
  sections: Map<SectionName, string>,
  meta: BriefingMeta
): string {
  const sectionFragments: string[] = [];

  for (const name of SECTION_ORDER) {
    const html = sections.get(name);
    if (html && html.trim()) {
      validateSectionHtml(name, html);
      sectionFragments.push(html);
    }
  }

  const innerHtml = sectionFragments.join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- HEADER -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#888;">Evening Briefing</div>
    <div style="font-size:28px;font-weight:700;color:#fff;margin:8px 0;">${meta.date}</div>
    <div style="font-size:12px;color:#666;">${meta.tickerCount} tickers analyzed &middot; Generated in ${meta.generationTimeSeconds.toFixed(1)}s</div>
  </div>

  <!-- ANALYSIS -->
  ${innerHtml}

  <!-- FOOTER -->
  <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #333;">
    <div style="font-size:11px;color:#666;line-height:1.6;">
      AI-generated analysis for informational purposes only.<br>
      Not financial advice. Always do your own research.
    </div>
    <div style="font-size:11px;color:#555;margin-top:12px;">
      Powered by Claude &middot; Generated in ${meta.generationTimeSeconds.toFixed(1)}s
    </div>
  </div>

</div>
</body>
</html>`;
}
