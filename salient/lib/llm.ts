import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

type LlmResult = { text: string; cached: boolean; warning?: string };

function cachePath(key: string) {
  fs.mkdirSync(config.llmCacheDir, { recursive: true });
  return path.join(config.llmCacheDir, `${key}.json`);
}

function extractText(message: any) {
  return (message.content || []).map((c: any) => c.type === "text" ? c.text : "").join("\n").trim();
}

export async function callClaude(prompt: string, maxTokens = 1600): Promise<LlmResult> {
  const key = crypto.createHash("sha256").update(JSON.stringify({ model: config.model, effort: config.effort, prompt })).digest("hex");
  const file = cachePath(key);
  const noCache = process.env.SALIENT_NO_CACHE === "1";
  if (!noCache && fs.existsSync(file)) return { text: JSON.parse(fs.readFileSync(file, "utf8")).text, cached: true };
  if (!config.claudeApiKey) return { text: "", cached: false, warning: "CLAUDE_API_KEY missing; deterministic fallback used" };
  const client = new Anthropic({ apiKey: config.claudeApiKey });
  const base = { model: config.model, max_tokens: maxTokens, messages: [{ role: "user" as const, content: prompt }] };
  const reasoning = config.effort ? { thinking: { type: "adaptive" }, output_config: { effort: config.effort } } : undefined;
  try {
    const message = await client.messages.create(reasoning ? { ...base, ...reasoning } as any : base);
    const text = extractText(message);
    fs.writeFileSync(file, JSON.stringify({ text, createdAt: new Date().toISOString() }, null, 2));
    return { text, cached: false };
  } catch (err: any) {
    const warning = `Claude thinking parameter rejected or call failed: ${err?.message || err}`;
    try {
      const message = await client.messages.create(base);
      const text = extractText(message);
      fs.writeFileSync(file, JSON.stringify({ text, createdAt: new Date().toISOString(), warning }, null, 2));
      return { text, cached: false, warning };
    } catch (err2: any) {
      return { text: "", cached: false, warning: `${warning}; plain call failed: ${err2?.message || err2}` };
    }
  }
}

export function jsonFromText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}
