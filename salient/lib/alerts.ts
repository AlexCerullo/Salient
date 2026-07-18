import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { cscSchema, CSC } from "./csc";
import { callClaude, jsonFromText } from "./llm";

export type AlertDoc = {
  id: string;
  title: string;
  url: string;
  datePublished: string;
  kind: "boxed_warning" | "safety_communication" | "label_change" | "shortage";
  excerpt: string;
  csc: CSC;
};

export function listAlerts(): AlertDoc[] {
  return fs.readdirSync(config.alertsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(config.alertsDir, f), "utf8")))
    .map((a) => ({ ...a, csc: cscSchema.parse(a.csc) }));
}

export function getAlert(alertId: string) {
  const alert = listAlerts().find((a) => a.id === alertId);
  if (!alert) throw new Error(`Unknown alert ${alertId}`);
  return alert;
}

export async function comprehendAlert(alert: Pick<AlertDoc, "id" | "title" | "url" | "datePublished" | "kind" | "excerpt" | "csc">) {
  const prompt = `Convert this FDA safety alert into strict JSON matching this TypeScript shape:
{ id, alertId, title, source:{kind,url,datePublished}, severityTier:1|2|3, drugs:{names:string[],rxnormCodes?:string[]}, population:{minAgeYears?,maxAgeYears?,sex?,pregnancy?,minGestationalWeeks?,requiredConditions?:string[],excludedConditions?:string[]}, labCriteria?:[], interactionPairs?:[], requiredMonitoring?:string[], recommendedActionTemplate, rationale }
Return only JSON. Alert metadata and excerpt:
${JSON.stringify({ id: alert.id, title: alert.title, url: alert.url, datePublished: alert.datePublished, kind: alert.kind, excerpt: alert.excerpt }, null, 2)}
Known local demo criteria that must remain computable: ${JSON.stringify(alert.csc)}`;
  const llm = await callClaude(prompt, 1400);
  if (llm.text) {
    try {
      return { csc: cscSchema.parse(jsonFromText(llm.text)), warning: llm.warning };
    } catch (err: any) {
      const retry = await callClaude(`${prompt}\nYour previous JSON failed validation: ${err.message}. Return corrected JSON only.`, 1400);
      if (retry.text) {
        try {
          return { csc: cscSchema.parse(jsonFromText(retry.text)), warning: retry.warning || llm.warning };
        } catch {}
      }
      return { csc: alert.csc, warning: `LLM CSC invalid; curated CSC fallback used. ${llm.warning || ""}`.trim() };
    }
  }
  return { csc: alert.csc, warning: llm.warning };
}
