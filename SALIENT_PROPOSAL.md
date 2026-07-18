# Salient — Final Proposal

**One-liner:** The FDA knows the drug is dangerous. It doesn't know your patients. Salient closes that gap in seconds.

**Name:** *Salient* — in 5,000 charts, six patients matter today. We surface the salient ones.

**Category:** When medical knowledge changes, nothing re-reads the chart. Salient is the agent that does — starting with FDA drug-safety signals.

**Brief alignment:** One operational workflow (drug-safety-signal response), made faster (weeks → seconds), smarter (chart + conversation context), and safer (cited, human-approved actions). Built as an agentic system per Anthropic's [building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents) guidance: a composable workflow — prompt-chained comprehension, deterministic tools, an evaluator loop on every claim — not a free-running autonomous agent. Shippable Monday: a clinic connects its FHIR export, and the first digest is waiting Monday morning.

---

## 1. The Story (stat-armed narrative)

### Act 1 — The firehose
- In a single year, the FDA took **181 major safety actions**: 25 new boxed warnings, 19 new contraindications, 90 new warnings ([JAMA Intern Med](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/1108624)).
- Drugs approved 1997–2016 accumulated **1,710 safety-related label changes** across 382 drugs ([BMJ](https://www.bmj.com/content/358/bmj.j3837)); CDER logged **6,502 safety-labeling-change entries in two years** (FY2020–21), incl. 374 boxed-warning entries.
- Plus: **~25 boxed-warning events/year** (2015–2024 analysis, [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11069364/)), 17,700+ drug recall records in openFDA, ~90+ ongoing shortages at any time.
- **No human can watch this firehose — and none of it maps itself to patients.** The FDA publishes the risk; it has no idea who your patients are.

### Act 2 — Warnings don't reach patients already exposed
- Opioid + benzodiazepine boxed warning (2016): co-prescribing fell only **17.9%** in 16 months ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6751777/)).
- Codeine contraindicated in children (2017): **1.9M pediatric codeine prescriptions still dispensed 2014–2019**; post-warning, codeine was still **65% of opioid fills after strabismus surgery** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9647590/), [J Surg Res](https://www.sciencedirect.com/science/article/abs/pii/S0022480420304066)).
- Citalopram QT warning: **40% of high-dose VA patients still overexposed at 6 months** ([PubMed](https://pubmed.ncbi.nlm.nih.gov/27166093/)).
- Valproate in pregnancy: pregnancy rates during treatment **unchanged over 15 years** of escalating FDA communications ([JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2818883)).
- Cisapride: contraindicated prescribing moved from 26% to 24% — the study's conclusion: "no material effect" ([JAMA](https://jamanetwork.com/journals/jama/fullarticle/193379)).
- Awareness itself fails: years after the pediatric codeine boxed warning, only **48.9% of pharmacists and 51.3% of pediatricians knew about it** ([PubMed](https://pubmed.ncbi.nlm.nih.gov/30181719/)). Physicians correctly identify boxed-warning drugs **36% of the time**; **29% report no method at all** for keeping up ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4880604/)).

### Act 3 — The harm
- ADEs: **>1.5M ED visits/year, ~500K hospitalizations** ([CDC](https://www.cdc.gov/medication-safety/data-research/facts-stats/index.html)).
- Older adults: **>600K ED visits/year**; **up to 88% of elderly ADR hospitalizations judged preventable** ([PubMed](https://pubmed.ncbi.nlm.nih.gov/12061133/)). **42% of 65+ take 5+ medications** ([JAMA 2024](https://jamanetwork.com/journals/jama/articlepdf/2821721/jama_harris_2024_ib_240211_1723483084.21712.pdf)).
- Preventable inpatient ADEs: ~400K/year, **$3.5B added cost**; ~$4,700–5,900 per event ([AHRQ](https://www.ahrq.gov/research/findings/nhqrdr/chartbooks/patientsafety/patientsafety-slides.html), [JAMA](https://jamanetwork.com/journals/jama/article-abstract/413545)).

### Act 4 — The proof it's fixable
- **Marshfield Clinic** built this workflow manually (pharmacy-led "Drug Safety Alert Program"): from just **6 FDA alerts**, they found **10,337 potential ADEs** across 383K patients and **resolved 8,007** via prescribing changes; high-dose citalopram use fell **91%** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10397605/)).
- **The VA** pushed a national citalopram bulletin **within one week** — and got 60% corrected within 180 days.
- **The punchline:** when patient-specific lists reach prescribers, exposure collapses. The bottleneck is never the medicine — it's making the lists. Marshfield needed a pharmacy department and a data warehouse. Salient is that department, as an agent.

---

## 2. Status Quo — Two Worlds, One Gap

### Track A: Small practices (~47% of US physicians are in practices of ≤10)
**How they learn:** fragmented — MedWatch emails (if subscribed), specialty newsletters, "Dear Healthcare Provider" letters (FDA's own guidance admits these get **discarded as junk mail**), media, the "clinical grapevine" ([FDA](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/using-electronic-means-distribute-certain-product-information), [BJCP](https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/bcp.15007)).

**What happens next: nothing systematic.**
- Only **~7% of primary-care practices have a pharmacist**; excluding hospital settings, only **10.6% of pharmacists are co-located with any PCP** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3948761/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10549564/)).
- Registry capacity is weak: in AHRQ's EvidenceNOW (1,500+ small practices), only **42% could produce a basic quality report**; older data: **~28% of EHR-using practices couldn't generate a medication registry** ([AHRQ](https://www.ahrq.gov/evidencenow/research-results/results/infographics/ehr-text.html), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2762852/)).
- Their EHRs (athenahealth, eCW, Practice Fusion) push updated drug-interaction content — but it fires **prospectively at the next prescription**. Nothing re-scans the existing panel when a new warning lands. No vendor evidence of retroactive scans exists.
- The PCP is already spending **52 min/day on the inbox** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8068414/)) — panel surveillance is nobody's job.

**Small-practice reality in one line:** the alert arrives as junk mail, there's no one to run the query, and the EHR only checks the *next* prescription — never the last one.

### Track B: Large health systems
**Machinery exists — and is required.** Joint Commission MM standards require written processes for responding to recalls/shortages; CMS CoPs require pharmacy oversight and error-minimization policies. P&T committees, medication-safety officers, pharmacy informatics.

**But the machinery is slow and staff-hungry:**
- Signal intake → next committee meeting (often **monthly/quarterly** cadence; Marshfield reviewed the Aug 24 citalopram warning at its *September* meeting) → cohort spec written by hand → pharmacy-informatics query queue (SlicerDicer / Reporting Workbench) → CDS governance for any new alert (Utah: enterprise committee, weekly working group, Jira queue — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6371304/)) → prescriber letters.
- Codeine case study: FDA warning April 20, 2017 → EHR alerts live **~6 weeks later** ([J Pediatr Pharmacol](https://www.sciencedirect.com/science/article/pii/S1544319122004058)).
- Even after identification, follow-through leaks: U-Michigan found 199 patients on excessive citalopram post-warning, but only **8.5% got the recommended EKG** — identification without prepared actions isn't enough.
- Alert-fatigue management is its own project: Kaiser had to prune 32,045 monthly alerts down to 1,168 to get ~20–30% physician acceptance ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7647201/)).

**Large-system reality in one line:** required by regulators to respond, they do it with committees and spreadsheets — in weeks, per alert, with pharmacist hours they don't have spare.

---

## 3. Where We Fit

The landscape sorted on two axes — *when it runs* and *what it knows*:

| | Workflow-triggered (next Rx) | Event-driven (new signal → whole panel) |
|---|---|---|
| **Claims data** | Pharmacy POS edits | Retrospective DUR (PBM faxes, quarterly, ignored) |
| **Clinical data (meds+dx+labs+conversation)** | FDB/Medi-Span CDS, Epic BPAs, Synapse Medicine | **Salient — empty quadrant** |

- Point-of-prescribing CDS (FDB Targeted Medication Warnings, Medi-Span, Synapse): fires at the *next* order. Never revisits the panel.
- Retrospective DUR (PBMs): claims-only, no labs/conditions context, quarterly, communicates **by fax and mail** — the literal fax machine this hackathon's prompt mocks.
- Population-health platforms (Healthy Planet, Arcadia, Innovaccer): care-gap *analytics* that humans must configure per measure; no FDA-signal ingestion.
- FDA/UCSF "Healthy Citizen" prototype: nightly recall scans → patient-portal blasts; blocked at lot-number tracing, recall-only, non-commercial ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12798837/)). We deliberately target *criteria-based* signals (safety communications, boxed warnings, label changes, shortages) — the class where matching is possible — and route to **clinicians**, not patient blasts.
- Marshfield DSAP: proves the workflow's value, manually, at one system with a warehouse and a pharmacy army.

**Fit — one service, every clinic size.** Salient is a single product: signal in → verified, cited case queue out. What changes between a solo clinic and a 400,000-patient system is only *who sits in the review seat* — the physician herself, or the medication-safety pharmacist who approves and routes. Same queue, same evidence chains, same audit trail. The workflow belongs to the alert, not to the org chart, so it scales without forking:

- At a **small practice** (47% of US physicians), the review seat was empty — Salient fills it. It's the medication-safety department they could never hire, and the doctor spends five minutes approving, not five hours querying.
- At a **large system**, the review seat exists but drowns — Salient hands the pharmacist in it what today takes weeks of committee-to-informatics relay: severity rationale, computable criteria, the patient list with per-patient evidence, drafted prescriber tasking, audit trail. Review and fire.

**Money and empathy, same sentence.** Money: preventable ADEs cost ~$4,700–5,900 each and $3.5B/year inpatient alone; a Joint-Commission-required process currently burns pharmacist FTEs per alert; Salient prices per panel, pennies per patient. Empathy: the six patients in the queue are a grandmother on denosumab with failing kidneys and a 21-year-old who's pregnant and scared — people who get hurt by drugs someone, somewhere, already knew were dangerous for them. And the clinician already spending 52 minutes a day on the inbox didn't go to medical school to run database queries. Salient does the surveillance so humans do the medicine.

---

## 4. The Product (deep)

### Pipeline (one engine, five stages)
1. **Watch** — feeds: openFDA (label diffs, enforcement, shortages daily), MedWatch RSS, DSC pages. Demo uses 3 curated historical alerts + 1 parsed live.
2. **Comprehend** — Claude converts the prose alert into a **Computable Safety Criterion (CSC)**: JSON IR with drug set (RxNorm), population filters (age/sex/pregnancy/conditions as SNOMED/ICD), lab thresholds (LOINC), interaction pairs, required monitoring, severity tier, recommended action template. *The IR is shown in the UI — judges see the alert become code.*
3. **Scan** — deterministic engine sweeps all patients' FHIR (MedicationRequests × Conditions × Observations) against the CSC. Cheap, fast, explainable. 5,000 patients → dozens of candidates.
4. **Adjudicate** — Claude reviews each candidate with full chart context (+ ambient transcript where available): actionable or not, priority, rationale, **every claim cited to a FHIR resource ID or transcript span**. A second verification pass re-checks that every citation exists and supports the claim (evaluator loop; unverifiable claims are dropped or flagged).
5. **Route** — cases grouped by responsible prescriber into a batched digest: evidence chain + one-click approve/dismiss on a drafted action (order lab, switch drug, schedule visit, patient message). Full audit log. **Nothing interrupts a visit; nothing auto-executes.**

### The Abridge layer (the differentiator in the room)
The 25 Abridge encounters form the deep-dive tier: adjudication reads the *conversation*, not just the chart. Demo case: opioid-in-pregnancy signal — chart says hydrocodone/tramadol **PRN**; transcript says *"most days is the honest answer, lately"* + near-abrupt discontinuation. Chart-only scan: low priority. Conversation-aware scan: top of queue, citing the quote. This is Linked Evidence extended from *documentation* to *population safety* — the argument that ambient capture isn't just a note factory; it's a safety sensor.

### Trust design (what makes clinician judges nod)
- Funnel transparency: 5,000 → 14 → 6, with per-stage reasons.
- Kaiser precedent as design principle: fewer, better alerts (they pruned 32K→1.2K/month to be usable).
- Human-in-the-loop always; drafted actions (the U-Mich 8.5%-EKG stat proves lists without prepared actions fail).
- Every claim cited; citation-verified; audit trail per decision.

### Eval story (the Anthropic taste)
- Synthetic panel of 5,000 (Synthea) with **~20 planted ground-truth positives** per alert → report precision/recall live.
- The 25 Abridge encounters scored for transcript-derived escalations.
- Harness is model-agnostic: as models improve, the same evals show comprehension/adjudication climbing — **the product gets better every model release; the scaffolding is the company.**

### Future-models framing
Alert-comprehension (prose → CSC) is exactly the frontier-model-bound task: today it needs review; next year's model reads *every* label change, guideline update, and shortage notice. Roadmap: FDA signals → drug shortages (same pipeline, daily feed) → guideline changes (USPSTF CRC-at-45: uptake was still 33.7% two years later) → "when medicine changes, Salient re-reads every chart." Exposed as MCP tools so any agent stack can call scan/adjudicate.

---

## 5. The 1-Minute Demo

| t | Beat |
|---|---|
| 0–10s | "This is a real 2024 FDA boxed warning — denosumab causes severe hypocalcemia in advanced kidney disease. FDA published it. Nobody told these clinicians which patients it hits." |
| 10–35s | Click **Ingest**. Alert → CSC JSON flashes → funnel animates live: **5,000 patients → 14 candidates → 6 actionable**, ranked. |
| 35–55s | Open case #1: evidence chain (denosumab Rx + eGFR 18 + no recent calcium) each citing its FHIR resource; drafted action: order calcium, flag prescriber. Then the kicker: pregnancy case, priority escalated by the transcript quote, highlighted. Approve. |
| 55–60s | "Marshfield did this with a pharmacy department and resolved 8,007 exposures. Half of US doctors have no pharmacy department. Now they don't need one." |

Backup: recorded run + pre-warmed cache. All numbers on screen are real outputs.

---

## 6. Build Plan (solo, today)

1. **Hour 0–1:** Synthea 5k-patient panel (FHIR R4); loader normalizing meds/conditions/observations into queryable store; plant ground-truth positives.
2. **Hour 1–2:** CSC schema + Claude alert-parser; validate on denosumab, NSAID-pregnancy, lamotrigine alerts.
3. **Hour 2–3:** Deterministic scan engine + funnel metrics.
4. **Hour 3–5:** Claude adjudicator + citation-verification pass; Abridge-transcript integration for the 25 encounters.
5. **Hour 5–6:** UI — dashboard (funnel, queue), case view (evidence chain, approve/dismiss), live-ingest button.
6. **Hour 6–7:** Eval run (precision/recall on planted cases); polish; demo script + recorded backup.
7. **Throughout:** public repo, commit trail, README ("what we built today vs. what we used": openFDA public domain, Synthea Apache-2.0, Abridge dataset provided for event, Claude API).

Budget: deterministic prefilter keeps Claude calls to ~dozens of adjudications per alert — well under $100.

---

## 7. Q&A Armor

- **"More alerts? Clinicians are drowning."** Inverted: we *filter* the firehose. Batched digest, never interruptive, funnel shown. Kaiser proved fewer-better works (20–30% acceptance after pruning).
- **"Doesn't Epic do this?"** Epic checks the *next* prescription. When a new warning lands, Epic shops assign an analyst to hand-write SlicerDicer queries — weeks, per alert, if prioritized. Nothing retroactive is automatic. (Codeine: 6 weeks to alerts, at a motivated academic center.)
- **"PBMs do retrospective DUR."** Claims-only, no labs or conditions, quarterly, and they notify prescribers **by fax and mail**. This hackathon's prompt is literally about replacing that.
- **"Why does this need an LLM?"** Two places: (1) alerts are prose — turning a DSC into computable criteria is unstructured→structured extraction; (2) adjudication needs clinical nuance a rule can't express: PRN-vs-daily from a transcript, gestational age, eGFR trajectory. Everything rule-expressible stays deterministic.
- **"Hallucinations?"** The LLM never selects the cohort (deterministic scan does); it only adjudicates bounded candidates; every claim must cite a verifiable FHIR ID/transcript span, re-checked by a second pass; a human approves every action.
- **"HIPAA?"** All-synthetic today; architecture is deployable on-prem or BAA'd cloud; only structured criteria leave the building, not patient data.
- **"Business model?"** One service, priced per panel size — pennies per patient. Small practices buy the med-safety department they can't hire; systems buy back pharmacist weeks against a Joint-Commission-required process. Same product, no forked roadmap.
- **"Small and large clinics need different tools."** No — they need the same queue with a different person in the review seat. The workflow belongs to the alert, not the org chart. That's why one service scales both ways without scattering.
- **"Why hasn't anyone built it?"** The feeds went machine-readable (openFDA), FHIR access standardized (SMART/Cures Act), and models only recently became able to read an FDA alert reliably. The window is now.

## 8. Rules Compliance
Public repo from first commit; everything demoed built today; "built vs. used" slide + README attribution (openFDA = public domain, Synthea = Apache-2.0, synthetic-ambient-fhir-25 = provided by Abridge for this event, Claude API); no real patient data anywhere.
