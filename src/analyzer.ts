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
  date: string
): Promise<string> {
  const { systemPrompt, buildUserMessage } = SECTION_CONFIGS[section];
  const userMessage = buildUserMessage(stocks, date);

  console.log(`  [${section}] ${stocks.length} candidates → Claude (${(userMessage.length / 1000).toFixed(0)}K chars)...`);

  const response = await client.messages.create({
    model: CONFIG.claudeModel,
    max_tokens: CONFIG.claudeMaxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Claude returned no text for section: ${section}`);
  }

  return textBlock.text.trim();
}

export async function analyzeStocks(
  filtered: Map<SectionName, EnrichedStock[]>,
  date: string
): Promise<Map<SectionName, string>> {
  const client = new Anthropic({ apiKey: ENV.anthropicApiKey });

  // Fire all non-empty sections in parallel
  const entries = ([...filtered.entries()] as [SectionName, EnrichedStock[]][])
    .filter(([, stocks]) => stocks.length > 0);

  const results = await Promise.all(
    entries.map(async ([section, stocks]) => {
      const html = await callClaude(client, section, stocks, date);
      return [section, html] as [SectionName, string];
    })
  );

  return new Map(results);
}
