import Anthropic from "@anthropic-ai/sdk";
import { CONFIG, ENV, type EnrichedStock, type SectionName } from "./config.js";
import {
  sma150SystemPrompt, buildSma150UserMessage,
  sma200SystemPrompt, buildSma200UserMessage,
  longtermSystemPrompt, buildLongtermUserMessage,
  patternsSystemPrompt, buildPatternsUserMessage,
  rsiSystemPrompt, buildRsiUserMessage,
} from "./prompts.js";

type SectionConfig = {
  systemPrompt: string;
  buildUserMessage: (stocks: EnrichedStock[], date: string) => string;
};

const SECTION_CONFIGS: Record<SectionName, SectionConfig> = {
  sma150: { systemPrompt: sma150SystemPrompt, buildUserMessage: buildSma150UserMessage },
  sma200: { systemPrompt: sma200SystemPrompt, buildUserMessage: buildSma200UserMessage },
  longterm: { systemPrompt: longtermSystemPrompt, buildUserMessage: buildLongtermUserMessage },
  patterns: { systemPrompt: patternsSystemPrompt, buildUserMessage: buildPatternsUserMessage },
  rsi: { systemPrompt: rsiSystemPrompt, buildUserMessage: buildRsiUserMessage },
};

async function callClaude(
  client: Anthropic,
  section: SectionName,
  stocks: EnrichedStock[],
  date: string,
  marketContext: string
): Promise<string> {
  const { systemPrompt, buildUserMessage } = SECTION_CONFIGS[section];
  const body = buildUserMessage(stocks, date);
  const userMessage = marketContext ? `${marketContext}\n\n${body}` : body;

  console.log(`  [${section}] ${stocks.length} candidates → Claude (${(userMessage.length / 1000).toFixed(0)}K chars)...`);

  const response = await client.messages.create({
    model: CONFIG.claudeModel,
    max_tokens: CONFIG.claudeMaxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  // Truncated HTML would render broken in the email — fail the section instead
  if (response.stop_reason === "max_tokens") {
    throw new Error(`Claude output truncated at ${CONFIG.claudeMaxTokens} tokens for section: ${section}`);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Claude returned no text for section: ${section}`);
  }

  let html = textBlock.text.trim();

  // Defensive: strip markdown code fences if the model wrapped its output despite instructions
  if (html.startsWith("```")) {
    html = html.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  }

  return html;
}

const SECTION_TITLES: Record<SectionName, string> = {
  sma150: "SMA 150 SETUPS",
  sma200: "SMA 200 SETUPS",
  longterm: "LONG-TERM SETUPS",
  patterns: "CHART PATTERNS",
  rsi: "RSI SIGNALS",
};

function failureFragment(section: SectionName): string {
  return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9b9bce;margin:28px 0 12px;font-weight:600;">${SECTION_TITLES[section]}</div>
<div style="background:#16213e;border-radius:10px;padding:14px 18px;margin-bottom:10px;border-left:3px solid #e53935;font-size:13px;color:#888;">Analysis for this section failed to generate. Check the run logs.</div>`;
}

export async function analyzeStocks(
  filtered: Map<SectionName, EnrichedStock[]>,
  date: string,
  marketContext: string
): Promise<Map<SectionName, string>> {
  const client = new Anthropic({ apiKey: ENV.anthropicApiKey });

  // Fire all non-empty sections in parallel. One failed section shouldn't
  // kill the whole briefing — render what succeeded and flag the gap.
  const entries = ([...filtered.entries()] as [SectionName, EnrichedStock[]][])
    .filter(([, stocks]) => stocks.length > 0);

  const results = await Promise.allSettled(
    entries.map(([section, stocks]) => callClaude(client, section, stocks, date, marketContext))
  );

  const sections = new Map<SectionName, string>();
  const failures: SectionName[] = [];

  results.forEach((result, i) => {
    const [section] = entries[i];
    if (result.status === "fulfilled") {
      sections.set(section, result.value);
    } else {
      failures.push(section);
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`  [${section}] Claude call failed: ${reason}`);
      sections.set(section, failureFragment(section));
    }
  });

  if (failures.length === entries.length && entries.length > 0) {
    throw new Error("All Claude section calls failed — aborting briefing");
  }

  return sections;
}
