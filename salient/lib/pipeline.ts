import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getAlert, comprehendAlert, AlertDoc } from "./alerts";
import { loadPatientIndex } from "./patient-index";
import { scanPatients } from "./scan";
import { adjudicateCandidate } from "./adjudicate";
import { PipelineRun } from "./types";

export async function runPipeline(alertOrId: string | AlertDoc, onStage?: (event: string, payload: any) => void) {
  const warnings: string[] = [];
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  let last = t0;
  const lap = (stage: string) => {
    const now = Date.now();
    timings[stage] = now - last;
    last = now;
  };
  const alert = typeof alertOrId === "string" ? getAlert(alertOrId) : alertOrId;
  const alertId = alert.id;
  onStage?.("watch", { alertId, title: alert.title, panel: 25 });
  const { csc, warning } = await comprehendAlert(alert);
  if (warning) warnings.push(warning);
  lap("comprehend");
  onStage?.("comprehend", { csc, warning, ms: timings.comprehend });
  const patients = loadPatientIndex(config.data25Path);
  const scan = scanPatients(csc, patients);
  lap("scan");
  onStage?.("scan", { total: scan.total, candidates: scan.candidates.length, counts: scan.counts, exclusions: scan.exclusions, ms: timings.scan, candidateSummaries: scan.candidates.map((c) => ({ name: c.patient.name, matchType: c.matchType })) });
  const cases = [];
  for (const candidate of scan.candidates) {
    onStage?.("adjudicating", { name: candidate.patient.name, matchType: candidate.matchType });
    const result = await adjudicateCandidate(alertId, csc, candidate);
    warnings.push(...result.warnings);
    cases.push(result.case);
    onStage?.("adjudicate", { case: result.case });
  }
  lap("adjudicate");
  const allClaims = cases.flatMap((c) => c.claims);
  lap("verify");
  onStage?.("verify", {
    claims: allClaims.length,
    verified: allClaims.filter((c) => c.verified).length,
    ms: timings.adjudicate
  });
  const actionable = cases.filter((c) => c.actionable);
  const monitored = cases.filter((c) => c.verdict === "monitor");
  const routed: Record<string, string[]> = {};
  for (const c of actionable) {
    routed[c.routeTo] ||= [];
    routed[c.routeTo].push(c.caseId);
  }
  timings.total = Date.now() - t0;
  onStage?.("route", { actionable: actionable.length, monitored: monitored.length, routed, ms: timings.total });
  const run: PipelineRun = {
    alertId,
    title: alert.title,
    createdAt: new Date().toISOString(),
    csc,
    funnel: { total: scan.total, scanCandidates: scan.candidates.length, actionable: actionable.length, monitored: monitored.length },
    scan: {
      total: scan.total,
      counts: scan.counts,
      candidates: scan.candidates.map((c) => ({ sourceIndex: c.patient.sourceIndex, patientId: c.patient.patientId, name: c.patient.name, reasons: c.reasons, matchedEvidence: c.matchedEvidence, matchType: c.matchType })),
      exclusions: scan.exclusions
    },
    cases,
    routed,
    timings,
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

export function listRuns() {
  if (!fs.existsSync(config.runsDir)) return [] as PipelineRun[];
  return fs.readdirSync(config.runsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(config.runsDir, f), "utf8")) as PipelineRun);
}
