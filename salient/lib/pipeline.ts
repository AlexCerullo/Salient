import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getAlert, comprehendAlert } from "./alerts";
import { loadPatientIndex } from "./patient-index";
import { scanPatients } from "./scan";
import { adjudicateCandidate } from "./adjudicate";
import { PipelineRun } from "./types";

export async function runPipeline(alertId: string, onStage?: (event: string, payload: any) => void) {
  const warnings: string[] = [];
  const alert = getAlert(alertId);
  onStage?.("watch", { alertId, panel: 25 });
  const { csc, warning } = await comprehendAlert(alert);
  if (warning) warnings.push(warning);
  onStage?.("comprehend", { csc, warning });
  const patients = loadPatientIndex(config.data25Path);
  const scan = scanPatients(csc, patients);
  onStage?.("scan", { total: scan.total, candidates: scan.candidates.length, counts: scan.counts, exclusions: scan.exclusions });
  const cases = [];
  for (const candidate of scan.candidates) {
    const result = await adjudicateCandidate(alertId, csc, candidate);
    warnings.push(...result.warnings);
    cases.push(result.case);
    onStage?.("adjudicate", { case: result.case });
  }
  const actionable = cases.filter((c) => c.actionable);
  const routed: Record<string, string[]> = {};
  for (const c of actionable) {
    routed[c.routeTo] ||= [];
    routed[c.routeTo].push(c.caseId);
  }
  onStage?.("route", { actionable: actionable.length, routed });
  const run: PipelineRun = {
    alertId,
    title: alert.title,
    createdAt: new Date().toISOString(),
    csc,
    funnel: { total: scan.total, scanCandidates: scan.candidates.length, actionable: actionable.length },
    scan: {
      total: scan.total,
      counts: scan.counts,
      candidates: scan.candidates.map((c) => ({ sourceIndex: c.patient.sourceIndex, patientId: c.patient.patientId, name: c.patient.name, reasons: c.reasons, matchedEvidence: c.matchedEvidence })),
      exclusions: scan.exclusions
    },
    cases,
    routed,
    warnings: [...new Set(warnings.filter(Boolean))]
  };
  fs.mkdirSync(config.runsDir, { recursive: true });
  fs.writeFileSync(path.join(config.runsDir, `${alertId}.json`), JSON.stringify(run, null, 2));
  return run;
}

export function readRun(alertId: string) {
  const file = path.join(config.runsDir, `${alertId}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PipelineRun;
}
