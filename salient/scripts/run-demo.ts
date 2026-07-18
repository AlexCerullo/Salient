import { runPipeline } from "../lib/pipeline";

const alertId = process.argv[2] || "opioids-pregnancy";
const run = await runPipeline(alertId, (event, payload) => {
  console.log(event, JSON.stringify(payload).slice(0, 500));
});
console.log(JSON.stringify({
  alertId: run.alertId,
  funnel: run.funnel,
  cases: run.cases.map((c) => ({ index: c.patient.sourceIndex, name: c.patient.name, actionable: c.actionable, priority: c.priority, claims: c.claims.length, transcriptEscalation: c.transcriptEscalation })),
  warnings: run.warnings
}, null, 2));
