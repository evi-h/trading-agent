import { type BriefingMeta, type SectionName } from "./config.js";

// Ordered sections as they should appear in the email
const SECTION_ORDER: SectionName[] = ["sma150", "sma200", "longterm", "patterns", "rsi"];

export function buildEmailHtml(
  sections: Map<SectionName, string>,
  meta: BriefingMeta
): string {
  const sectionFragments: string[] = [];

  for (const name of SECTION_ORDER) {
    const html = sections.get(name);
    if (html && html.trim()) {
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
