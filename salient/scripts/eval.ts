import fs from "node:fs";
import path from "node:path";
import { config } from "../lib/config";
import { listAlerts } from "../lib/alerts";
import { loadPatientIndex } from "../lib/patient-index";
import { scanPatients } from "../lib/scan";
import { adjudicateCandidate } from "../lib/adjudicate";

fs.mkdirSync(config.evalDir, { recursive: true });
const patients = loadPatientIndex(config.evalPath);
const alerts = listAlerts();
const labels: Record<string, string[]> = {};
const perAlert: any[] = [];

for (const alert of alerts) {
  const scan = scanPatients(alert.csc, patients);
  labels[alert.id] = scan.candidates.map((c) => c.patient.recordId);
  const sample = scan.candidates.slice(0, 12);
  const cases = [];
  for (const candidate of sample) cases.push((await adjudicateCandidate(alert.id, alert.csc, candidate)).case);
  const predicted = new Set(scan.candidates.map((c) => c.patient.recordId));
  const truth = new Set(labels[alert.id]);
  const tp = [...predicted].filter((id) => truth.has(id)).length;
  const precision = predicted.size ? tp / predicted.size : 1;
  const recall = truth.size ? tp / truth.size : 1;
  const verifiedClaims = cases.flatMap((c) => c.claims).filter((c) => c.verified).length;
  const allClaims = cases.flatMap((c) => c.claims).length;
  perAlert.push({
    alertId: alert.id,
    scanCandidates: scan.candidates.length,
    adjudicatedSample: cases.length,
    actionableRate: cases.length ? cases.filter((c) => c.actionable).length / cases.length : 0,
    citationVerificationPassRate: allClaims ? verifiedClaims / allClaims : 1,
    scanPrecision: precision,
    scanRecall: recall
  });
}

fs.writeFileSync(path.join(config.evalDir, "labels.json"), JSON.stringify(labels, null, 2));
const overall = {
  scanPrecision: perAlert.reduce((a, x) => a + x.scanPrecision, 0) / perAlert.length,
  scanRecall: perAlert.reduce((a, x) => a + x.scanRecall, 0) / perAlert.length,
  citationVerificationPassRate: perAlert.reduce((a, x) => a + x.citationVerificationPassRate, 0) / perAlert.length
};
const out = { createdAt: new Date().toISOString(), dataset: "AI_synthetic_data/ai-synthetic-ambient-fhir-270.json", perAlert, overall };
fs.writeFileSync(path.join(config.evalDir, "latest.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
