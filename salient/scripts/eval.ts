/**
 * Eval harness. Runs the deterministic scan (and a sample of LLM adjudications) against the
 * 270-record AI synthetic panel plus seeded known-positives (see seed-eval.ts), and scores
 * against data/eval/ground-truth.json — labels that do NOT come from the scanner itself.
 *
 * Outputs data/eval/latest.json (surfaced as the UI eval badge) and a stdout table.
 * The live demo panel (25 Abridge records) is never used here.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../lib/config";
import { getCuratedCsc, listAlerts } from "../lib/alerts";
import { buildPatientIndexFromRecords } from "../lib/patient-index";
import { scanPatients } from "../lib/scan";
import { adjudicateCandidate } from "../lib/adjudicate";

const ADJUDICATION_SAMPLE = Number(process.env.SALIENT_EVAL_SAMPLE || 4);

async function main() {
  const groundTruthFile = path.join(config.evalDir, "ground-truth.json");
  const seedsFile = path.join(config.evalDir, "seeds.json");
  if (!fs.existsSync(groundTruthFile) || !fs.existsSync(seedsFile)) {
    console.error("Ground truth missing. Run: npx tsx scripts/seed-eval.ts");
    process.exit(1);
  }
  const groundTruth: Record<string, { recordId: string; source: string; note: string }[]> = JSON.parse(fs.readFileSync(groundTruthFile, "utf8"));
  const originals: any[] = JSON.parse(fs.readFileSync(config.evalPath, "utf8"));
  const seeds: any[] = JSON.parse(fs.readFileSync(seedsFile, "utf8"));

  const alerts = listAlerts().filter((a) => groundTruth[a.id]);
  const perAlert: any[] = [];
  for (const alert of alerts) {
    // Each alert is evaluated on the 270 originals + its own seeds (other alerts' seeds
    // would be legitimate matches — e.g. a seeded pregnant opioid user is a correct NSAID
    // monitor candidate — and would muddy the labels).
    const alertSeeds = seeds.filter((s) => s.metadata?.seed_alert === alert.id);
    const panel = buildPatientIndexFromRecords([...originals, ...alertSeeds]);
    const csc = getCuratedCsc(alert.id);
    const scan = scanPatients(csc, panel);
    const predicted = new Set(scan.candidates.map((c) => c.patient.recordId));
    const truth = new Set(groundTruth[alert.id].map((t) => t.recordId));
    const tp = [...predicted].filter((id) => truth.has(id));
    const fp = [...predicted].filter((id) => !truth.has(id));
    const fn = [...truth].filter((id) => !predicted.has(id));
    const precision = predicted.size ? tp.length / predicted.size : 1;
    const recall = truth.size ? tp.length / truth.size : 1;

    // Adjudicate a sample of candidates (organic first) for citation-verification quality.
    const sample = [...scan.candidates]
      .sort((a, b) => Number(Boolean(b.patient.raw?.metadata?.seeded)) - Number(Boolean(a.patient.raw?.metadata?.seeded)) || a.patient.sourceIndex - b.patient.sourceIndex)
      .reverse()
      .slice(0, ADJUDICATION_SAMPLE);
    let proposed = 0, verified = 0;
    const verdicts: Record<string, number> = {};
    for (const candidate of sample) {
      const { case: c } = await adjudicateCandidate(`eval-${alert.id}`, csc, candidate);
      proposed += c.claimAudit.proposed;
      verified += c.claimAudit.verified;
      verdicts[c.verdict] = (verdicts[c.verdict] || 0) + 1;
    }
    perAlert.push({
      alertId: alert.id,
      panelSize: panel.length,
      positives: truth.size,
      seededPositives: groundTruth[alert.id].filter((t) => t.source === "seeded").length,
      scanCandidates: scan.candidates.length,
      scanPrecision: precision,
      scanRecall: recall,
      falsePositives: fp,
      falseNegatives: fn,
      adjudicatedSample: sample.length,
      verdicts,
      claimsProposed: proposed,
      claimsVerified: verified,
      citationVerificationPassRate: proposed ? verified / proposed : 1
    });
  }

  const overall = {
    scanPrecision: perAlert.reduce((a, x) => a + x.scanPrecision, 0) / perAlert.length,
    scanRecall: perAlert.reduce((a, x) => a + x.scanRecall, 0) / perAlert.length,
    citationVerificationPassRate: (() => {
      const p = perAlert.reduce((a, x) => a + x.claimsProposed, 0);
      const v = perAlert.reduce((a, x) => a + x.claimsVerified, 0);
      return p ? v / p : 1;
    })()
  };
  const out = {
    createdAt: new Date().toISOString(),
    dataset: "AI_synthetic_data/ai-synthetic-ambient-fhir-270.json + seeded known-positives (eval only)",
    groundTruth: "data/eval/ground-truth.json (seeded by construction + audited organic matches)",
    perAlert,
    overall
  };
  fs.mkdirSync(config.evalDir, { recursive: true });
  fs.writeFileSync(path.join(config.evalDir, "latest.json"), JSON.stringify(out, null, 2));

  console.log("\nalert                     panel  pos  cand  P     R     claims verified");
  for (const a of perAlert) {
    console.log(
      `${a.alertId.padEnd(25)} ${String(a.panelSize).padStart(5)} ${String(a.positives).padStart(4)} ${String(a.scanCandidates).padStart(5)}  ${a.scanPrecision.toFixed(2)}  ${a.scanRecall.toFixed(2)}  ${String(a.claimsProposed).padStart(6)} ${String(a.claimsVerified).padStart(8)}`
    );
    if (a.falsePositives.length) console.log(`  FP: ${a.falsePositives.join(", ")}`);
    if (a.falseNegatives.length) console.log(`  FN: ${a.falseNegatives.join(", ")}`);
  }
  console.log(`\noverall: P=${overall.scanPrecision.toFixed(2)} R=${overall.scanRecall.toFixed(2)} citation-verification=${(overall.citationVerificationPassRate * 100).toFixed(0)}%`);
}

main();
