# Salient

**The FDA knows the drug is dangerous. It doesn't know your patients.**

Salient is an agentic drug-safety surveillance prototype built at the *Future of Agentic AI in Healthcare* hackathon (Anthropic × Abridge × Lightspeed, July 18 2026). When an FDA safety alert lands, point-of-prescribing CDS only checks the *next* prescription — nothing re-scans the patients already exposed. Salient does, in seconds:

1. **Watch** — an FDA safety alert arrives (prose).
2. **Comprehend** — Claude (`claude-fable-5`) parses it into a **Computable Safety Criterion** (CSC): strict, Zod-validated JSON a deterministic scanner can execute.
3. **Scan** — a deterministic (no-LLM) pass over the panel: drug exposure, population, labs, gestational thresholds. Every exclusion is recorded and explainable. OTC drugs get a **monitor pathway** — a chart can't rule out over-the-counter use.
4. **Adjudicate** — Claude reviews only the scanned candidates, weighing the *ambient transcript* against the structured chart (the chart says PRN; the conversation says "most days is the honest answer"). Verdicts: actionable / monitor / dismiss.
5. **Verify** — every claim must cite a FHIR resource id or a verbatim transcript quote; a mechanical verifier re-checks each citation against the source record and **drops anything that doesn't match**.
6. **Route** — actionable cases go to a prescriber-grouped review queue with a drafted action. Nothing auto-executes: a human approves or dismisses, and every decision lands in an append-only audit log.

## Run it

```bash
cd salient
npm install
npm run dev          # dashboard at http://localhost:3000
```

Requires `CLAUDE_API_KEY` in `../.env` (repo root). Without a key the pipeline degrades to a deterministic fallback and says so in the run warnings.

Other entry points:

```bash
npm test                      # vitest: scan, CSC schema, citation verification
npm run run:demo              # headless pipeline over all 3 alerts (terminal fallback)
npm run run:demo -- <alertId> # one alert
npx tsx scripts/seed-eval.ts  # (re)build eval ground truth
npm run eval                  # precision/recall + citation pass rate on the eval panel
SALIENT_NO_CACHE=1 npm run run:demo  # bypass the LLM disk cache ("it's really live")
```

## Evaluation

The eval panel is the 270-record AI-generated synthetic set **plus 24 seeded known-positive records built by construction** (cloned hosts with injected MedicationRequests/Conditions/transcript lines — see `scripts/seed-eval.ts`), scored against `data/eval/ground-truth.json`, which also contains 3 hand-audited organic positives. Ground truth never comes from the scanner itself.

Current result: **scan P=1.00, R=1.00; 52/52 adjudication claims pass mechanical citation verification.** Building this eval caught three real scanner bugs (postpartum, pregnancy-loss, and contraception-counseling records misread as current pregnancies) which are now fixed and covered.

## Built today vs. used

| Component | Provenance |
|---|---|
| Pipeline (CSC parser, deterministic scanner, adjudicator, mechanical citation verifier, router) | **Built at the event** |
| Dashboard UI, SSE streaming, audit log, live alert ingest | **Built at the event** |
| Eval harness + seeded ground truth | **Built at the event** |
| The 3 curated alert texts | Condensed from public FDA safety communications (public domain) |
| `synthetic-ambient-fhir-25` (live demo panel, 25 encounters) | Provided by Abridge for this event — the **only** data the live demo scans |
| `AI_synthetic_data` (270 encounters) | Our synthetic dataset — **eval only**, never in the demo panel |
| Claude API (`claude-fable-5`, medium effort) | Anthropic |
| Next.js, React, Tailwind, Zod, Vitest | Open source |

## Safety posture

- No auto-execution: every case requires explicit human approve/dismiss.
- Every LLM claim carries a citation that is mechanically re-verified; unverifiable claims are dropped before a clinician ever sees them.
- A case with zero verified claims can never be actionable.
- All patient data is synthetic.
