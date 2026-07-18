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
  /** Curated CSC used as a fallback when the LLM is unavailable. Live-ingested alerts have none. */
  csc?: CSC;
};

export function listAlerts(): AlertDoc[] {
  return fs.readdirSync(config.alertsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(config.alertsDir, f), "utf8")))
    .map((a) => ({ ...a, csc: a.csc ? cscSchema.parse(a.csc) : undefined }))
    .sort((a, b) => (b.datePublished || "").localeCompare(a.datePublished || ""));
}

export function getAlert(alertId: string) {
  const alert = listAlerts().find((a) => a.id === alertId);
  if (!alert) throw new Error(`Unknown alert ${alertId}`);
  return alert;
}

export function getCuratedCsc(alertId: string): CSC {
  const csc = getAlert(alertId).csc;
  if (!csc) throw new Error(`Alert ${alertId} has no curated CSC`);
  return csc;
}

export async function comprehendAlert(alert: Pick<AlertDoc, "id" | "title" | "url" | "datePublished" | "kind" | "excerpt" | "csc">) {
  const prompt = `You convert an FDA drug-safety alert (prose) into a Computable Safety Criterion (CSC): strict JSON a deterministic scanner can execute against patient records.

TypeScript shape:
{ id, alertId, title, source:{kind:"boxed_warning"|"safety_communication"|"label_change"|"shortage",url,datePublished}, severityTier:1|2|3, drugs:{names:string[],rxnormCodes?:string[],otcAvailable?:boolean}, population:{minAgeYears?,maxAgeYears?,sex?:"male"|"female",pregnancy?:boolean,minGestationalWeeks?,monitorFromGestationalWeeks?,requiredConditions?:string[],excludedConditions?:string[]}, labCriteria?:[{loinc?,nameContains,op:"<"|">"|"<="|">=",value,unit?,meaning}], interactionPairs?:[{a:string[],b:string[]}], requiredMonitoring?:string[], recommendedActionTemplate, rationale }

Guidance:
- drugs.names: include generic names, common brand names, and the drug-class word so text matching works (lowercase).
- drugs.otcAvailable: true when the drugs can be bought over the counter (chart absence would NOT rule out use).
- population.monitorFromGestationalWeeks: when the risk begins at a gestational-age threshold (e.g., "avoid at 20 weeks or later"), put the threshold here so earlier pregnancies are monitored rather than alerted.
- severityTier: 1 = boxed warning / serious harm, 2 = significant, 3 = informational.
- recommendedActionTemplate: 1-3 sentences with {patient}, {medications}, {prescriber} placeholders.
- id should be "csc-" + alertId; alertId is given below.

Return only JSON. Alert metadata and excerpt:
${JSON.stringify({ id: alert.id, title: alert.title, url: alert.url, datePublished: alert.datePublished, kind: alert.kind, excerpt: alert.excerpt }, null, 2)}${alert.csc ? `\nKnown local demo criteria that must remain computable: ${JSON.stringify(alert.csc)}` : ""}`;
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
      if (!alert.csc) throw new Error(`Could not derive a valid CSC for alert ${alert.id}: ${err.message}`);
      return { csc: alert.csc, warning: `LLM CSC invalid; curated CSC fallback used. ${llm.warning || ""}`.trim() };
    }
  }
  if (!alert.csc) throw new Error(`No LLM available and no curated CSC for alert ${alert.id}. ${llm.warning || ""}`.trim());
  return { csc: alert.csc, warning: llm.warning };
}
