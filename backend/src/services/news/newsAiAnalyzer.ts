import type { MarketNewsItem } from "./newsTypes.js";

export async function analyzeNewsWithOptionalAi(item: MarketNewsItem) {
  return {
    ...item,
    aiMode: process.env.OPENAI_API_KEY || process.env.MISTRAL_API_KEY ? "AI OPTIONAL" : "TECHNICAL ONLY",
    note: "News never creates a trade alone; technical, volume, playbook, and risk checks still apply."
  };
}
