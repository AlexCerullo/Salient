/**
 * Terminal fallback for the live demo: runs the pipeline headlessly and prints the
 * funnel plus each case with its verified citations. Usage:
 *   npm run run:demo                      # all three curated alerts
 *   npm run run:demo -- opioids-pregnancy # one alert
 */
import { listAlerts } from "../lib/alerts";
import { runPipeline } from "../lib/pipeline";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const alertIds = args.length ? args : listAlerts().filter((a) => a.csc).map((a) => a.id);

function line(char = "─", n = 74) {
  console.log(char.repeat(n));
}

async function main() {
  for (const alertId of alertIds) {
    const started = Date.now();
    const run = await runPipeline(alertId, (event, payload) => {
      if (event === "adjudicating") process.stdout.write(`  · adjudicating ${payload.name} (${payload.matchType})...\n`);
    });
    line("═");
    console.log(`ALERT  ${run.title}`);
    console.log(`FUNNEL ${run.funnel.total} patients → ${run.funnel.scanCandidates} candidates → ${run.funnel.actionable} actionable${run.funnel.monitored ? ` (+${run.funnel.monitored} monitored, no alert)` : ""}   [${((Date.now() - started) / 1000).toFixed(1)}s]`);
    for (const c of run.cases) {
      line();
      console.log(`${c.verdict.toUpperCase().padEnd(10)} ${c.patient.name} — ${c.patient.visitTitle}`);
      console.log(`  priority ${c.priority} · route to ${c.routeTo} · claims verified ${c.claimAudit.verified}/${c.claimAudit.proposed}`);
      console.log(`  rationale: ${c.rationale}`);
      if (c.transcriptEscalation) console.log(`  chart vs conversation: ${c.transcriptEscalation}`);
      if (c.monitorNote) console.log(`  monitor: ${c.monitorNote}`);
      for (const claim of c.claims) {
        const cite = claim.citation.type === "fhir"
          ? `${claim.citation.resourceType}/${claim.citation.resourceId}`
          : `"${claim.citation.quote}"`;
        console.log(`   ✓ ${claim.text}\n     ↳ ${cite}`);
      }
      console.log(`  drafted action: ${c.draftedAction}`);
    }
    if (run.warnings.length) console.log(`\n  warnings: ${run.warnings.join(" | ")}`);
    console.log();
  }
}

main();
