import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export const config = {
  repoRoot: path.resolve(process.cwd(), ".."),
  data25Path: path.resolve(process.cwd(), "../synthetic-ambient-fhir-25/synthetic-ambient-fhir-25.json"),
  evalPath: path.resolve(process.cwd(), "../AI_synthetic_data/ai-synthetic-ambient-fhir-270.json"),
  claudeApiKey: process.env.CLAUDE_API_KEY,
  model: process.env.SALIENT_MODEL || "claude-fable-5",
  effort: process.env.SALIENT_EFFORT || "medium",
  llmCacheDir: path.resolve(process.cwd(), ".cache/llm"),
  runsDir: path.resolve(process.cwd(), "data/runs"),
  evalDir: path.resolve(process.cwd(), "data/eval"),
  alertsDir: path.resolve(process.cwd(), "data/alerts")
};
