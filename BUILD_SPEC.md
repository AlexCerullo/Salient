# Salient — Build Spec (hackathon implementation)

Implementation spec for the product described in `SALIENT_PROPOSAL.md`. Read that file first for narrative context. This file is the authoritative engineering spec.

## Hard constraints

1. **Patient data for the real app = ONLY `synthetic-ambient-fhir-25/synthetic-ambient-fhir-25.json`** (25 encounters, schema in `synthetic-ambient-fhir-25/schema.json`). The panel size is 25, not 5,000 — all funnel numbers shown in the UI must be real numbers computed from these 25.
2. **`AI_synthetic_data/` (270 encounters) is for TESTING/EVAL ONLY.** It must never be loaded by the app runtime — only by the eval harness.
3. **LLM:** Anthropic Messages API, model **`claude-fable-5`**, **medium reasoning effort**. API key is in the repo-root `.env` as `CLAUDE_API_KEY` (nonstandard name — pass explicitly to the SDK client). Make model + effort configurable via env (`SALIENT_MODEL`, `SALIENT_EFFORT`) with those defaults. Request medium effort (the `effort`/thinking parameter of the Messages API); if the API rejects the parameter, fall back gracefully to a plain call and log a warning.
4. Human-in-the-loop always: nothing auto-executes. Every LLM claim must carry a citation to a FHIR resource id or a transcript span, and citations must be mechanically verified.
5. Keep API spend small: deterministic prefilter before any LLM call; cache all LLM responses on disk keyed by SHA-256 of (model + prompt) under `salient/.cache/llm/` so re-runs are free.

## Stack & layout

- Next.js (App Router) + TypeScript + Tailwind, in a new subfolder **`salient/`** of this repo. Node 24 is installed. Use `npm`.
- No database. Persistence = JSON files under `salient/data/runs/` (pipeline outputs) and `salient/data/audit-log.jsonl` (decisions). Commit a completed demo run as backup.
- Load repo-root `.env` explicitly (e.g., dotenv with path `../.env`) in a server-only config module.
- Vitest for unit tests.

## Domain model

### CSC — Computable Safety Criterion (the IR)
JSON produced by the Comprehend stage from FDA alert prose. Zod schema, roughly:

```ts
{
  id, alertId, title, source: { kind: "boxed_warning"|"safety_communication"|"label_change"|"shortage", url, datePublished },
  severityTier: 1|2|3,           // 1 = act now
  drugs: { names: string[],       // ingredient names + common synonyms/brand names, lowercase
           rxnormCodes?: string[] },
  population: { minAgeYears?, maxAgeYears?, sex?: "male"|"female",
                pregnancy?: boolean, minGestationalWeeks?,
                requiredConditions?: string[], excludedConditions?: string[] },  // substring terms
  labCriteria?: [{ loinc?: string, nameContains: string, op: "<"|">"|"<="|">=", value: number, unit?: string,
                   meaning: string }],
  interactionPairs?: [{ a: string[], b: string[] }],
  requiredMonitoring?: string[],
  recommendedActionTemplate: string,   // drafted action text with {placeholders}
  rationale: string
}
```

### Patient index (deterministic, built once at startup from the 25 encounters)
For each encounter: patientId, encounterId, name, age at encounter, sex, visitTitle/type, medications (union of `patient_context.longitudinal_summary.medication_labels` and `encounter_fhir.related_resources.MedicationRequest[]`, normalized to lowercase ingredient strings, keeping the source resource id when it exists), conditions (labels + encounter Conditions with ids), observations (LOINC code, text, value, unit, resource id), pregnancy status (derived from conditions/visit title/observations — e.g., prenatal visits, "Normal pregnancy" condition, gestational-age observations), transcript, note.

## Pipeline (5 stages, one engine)

1. **Watch** — `salient/data/alerts/*.json` + `.md`: 3 curated historical FDA alerts (real text excerpts + metadata + URL), plus a "live ingest" path where the user pastes arbitrary alert prose in the UI.
2. **Comprehend** — Claude call: alert prose → CSC JSON (use tool-use/structured output or strict JSON prompting + Zod validation with one retry-on-invalid). The CSC is displayed in the UI.
3. **Scan** — pure TypeScript, deterministic, no LLM: sweep the 25-patient index against the CSC (drug-name match ∧ population filters ∧ lab criteria ∧ interaction pairs). Output candidates with per-patient matched evidence (which med/condition/lab matched, with resource ids) AND per-patient exclusion reasons for non-candidates (funnel transparency, e.g., "on naproxen but not pregnant").
4. **Adjudicate** — for each candidate, Claude call with full context (demographics, matched evidence, relevant FHIR resources with ids, full transcript, note). Output JSON: `{ actionable: boolean, priority: "high"|"medium"|"low", rationale, claims: [{ text, citation: { type: "fhir", resourceType, resourceId } | { type: "transcript", quote } }], transcriptEscalation?: string, draftedAction }`. Then a **verification pass**: (a) mechanical — every fhir citation's resourceId must exist in that patient's data; every transcript quote must appear verbatim (case-insensitive, whitespace-normalized) in that transcript; (b) one cheap Claude call re-checking that each surviving citation supports its claim. Unverifiable claims are dropped; a case whose key claims all fail is flagged, not shown as actionable. Record verification results per claim (shown in UI as "citation verified ✓").
5. **Route** — group actionable cases by responsible prescriber (from the encounter's Practitioner participant if present, else the visit's clinic) into a digest: ranked case queue with evidence chains and one-click approve/dismiss on the drafted action. Decisions append to `salient/data/audit-log.jsonl` with timestamp, user action, case snapshot hash.

## The 3 curated alerts (chosen because they actually hit this 25-patient panel)

1. **`opioids-pregnancy`** — FDA boxed warning/DSC on opioid use in pregnancy (neonatal opioid withdrawal syndrome). Expected hit: encounter index 18 (born 2005, first pregnancy with chronic pain, on hydrocodone/APAP + tramadol; transcript contains "most days is the honest answer, lately" — this is the demo kicker: chart says PRN, transcript says daily → priority escalated with the quote cited). Other prenatal patients (idx 2, 9, 16) should be scanned and correctly excluded (no opioids).
2. **`nsaids-pregnancy-20wk`** — FDA 2020 Drug Safety Communication: NSAIDs at ≥20 weeks of pregnancy (oligohydramnios/fetal renal injury). Pregnant patients checked for NSAID exposure incl. transcript-mentioned OTC use; naproxen users (idx 8, 19, 24) excluded as not pregnant — show these exclusion reasons in the funnel.
3. **`hctz-skin-cancer`** — FDA Aug 2020 label change: hydrochlorothiazide and non-melanoma skin cancer. Expected hits: idx 6, 10, 12 (all on HCTZ 25 MG). Action template: risk counseling + skin-exam recommendation, prioritized by age/sun-exposure context from chart/transcript.

Verify these expectations against the actual data while building; adjust alert text/criteria so the demo funnel is genuinely computed, never hard-coded. It is fine (good, even) if adjudication downgrades some scan candidates — the funnel must be honest.

## API routes

- `GET /api/alerts` — curated alerts + any live-ingested ones, with run status.
- `POST /api/ingest` — `{ alertId }` or `{ rawText, title }` → runs Comprehend → returns CSC.
- `POST /api/run` — `{ alertId }` → full pipeline (comprehend→scan→adjudicate→verify→route), streams stage progress (SSE or chunked) so the UI can animate the funnel live; persists run JSON.
- `GET /api/runs/:alertId` — persisted run (funnel, candidates, exclusions, cases).
- `POST /api/cases/:caseId/decision` — `{ decision: "approve"|"dismiss", note? }` → audit log.

## UI (3 views, dark, clinical, dense — quality bar: something a judge screenshots)

1. **Dashboard** — alert feed (3 curated + "Paste new alert" box), per-alert Run/Ingest button; when running: CSC JSON panel flashes in, then live funnel animation **25 patients → N candidates → M actionable** with per-stage counts and reasons; ranked case queue below; precision/recall badge from the latest eval run (labelled "eval on 270-encounter synthetic test set").
2. **Case view** — patient header; evidence chain where each claim shows its citation chip (FHIR resource id → click opens the raw FHIR JSON in a drawer; transcript quote → click scrolls the embedded transcript with the span highlighted); verification checkmarks; drafted action with Approve / Dismiss; on decision, show audit-log entry.
3. **Funnel/exclusions view** (can be a tab of the dashboard) — every one of the 25 patients with match/exclude reason per stage.

## Eval harness (TESTING ONLY — uses `AI_synthetic_data/`)

- `npm run eval` (tsx script, not part of app runtime): builds the same patient index over the 270 encounters, runs Scan for the 3 CSCs, and adjudicates a capped sample (≤12 candidates, cached) — reports scan candidate counts, adjudication actionable rate, and citation-verification pass rate; writes `salient/data/eval/latest.json` which the dashboard badge reads if present.
- Ground truth: derive a small hand-checkable labels file (`salient/data/eval/labels.json`) by inspecting the 270-set index for genuinely matching records (script-assisted, deterministic criteria) so precision/recall of the scan stage is computable and honest.
- Vitest unit tests: scan-engine determinism (drug matching incl. brand/ingredient normalization, age/pregnancy filters, lab thresholds), citation mechanical verification (accepts verbatim quote, rejects fabricated quote/id), CSC Zod validation.

## Non-goals (do not build)

Auth, DB, multi-tenant, real openFDA polling (stub the Watch stage with the curated files + paste box), Synthea generation, patient messaging.

## Definition of done

- `cd salient && npm install && npm run dev` works; with a valid `CLAUDE_API_KEY`, clicking Run on `opioids-pregnancy` produces a live funnel ending with the pregnancy case top-of-queue, priority escalated by the verbatim transcript quote, every claim citation verified.
- `npm test` green; `npm run eval` produces the eval JSON; `npm run build` passes.
- `salient/README.md`: quickstart, architecture diagram (ASCII fine), "built today vs. used" attribution (openFDA public domain, synthetic-ambient-fhir-25 provided by Abridge for this event, Claude API), explicit note that all data is synthetic.
