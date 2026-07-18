/**
 * Builds the eval ground truth for the 270-record AI synthetic panel (EVAL ONLY — never the live demo panel).
 *
 * The 270 records contain almost no organic matches for the three demo alerts, so we PLANT
 * known-positive cases by construction: clone host records and inject the exact structured
 * evidence (MedicationRequest / Condition) and transcript lines that make them true positives.
 * Every planted id is recorded in data/eval/ground-truth.json together with the audited
 * organic positives, so precision/recall are measured against labels that do NOT come from
 * the scanner itself.
 *
 * Deterministic: same input -> same seeds. No LLM involved.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../lib/config";
import { buildPatientIndexFromRecords } from "../lib/patient-index";

type Seed = { record: any; recordId: string; alertId: string; note: string };

const records: any[] = JSON.parse(fs.readFileSync(config.evalPath, "utf8"));
const index = buildPatientIndexFromRecords(records);

function clone(x: any) {
  return JSON.parse(JSON.stringify(x));
}

function subjectRef(rec: any) {
  const existing = Object.values(rec.encounter_fhir.related_resources || {}).flat() as any[];
  return existing[0]?.subject?.reference || `urn:uuid:${rec.metadata.patient_id}`;
}

function pushResource(rec: any, type: string, resource: any) {
  rec.encounter_fhir.related_resources ||= {};
  rec.encounter_fhir.related_resources[type] ||= [];
  rec.encounter_fhir.related_resources[type].push(resource);
}

function injectMedication(rec: any, seedId: string, label: string, dosage: string) {
  pushResource(rec, "MedicationRequest", {
    resourceType: "MedicationRequest",
    id: `${seedId}-med-${crypto.createHash("sha1").update(label).digest("hex").slice(0, 8)}`,
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: label },
    subject: { reference: subjectRef(rec) },
    encounter: { reference: `urn:uuid:${rec.metadata.encounter_id}` },
    authoredOn: (rec.metadata.date || "2026-07-18").slice(0, 10),
    dosageInstruction: [{ text: dosage }]
  });
  const ls = rec.patient_context?.longitudinal_summary;
  if (ls) {
    ls.medication_labels ||= [];
    ls.medication_labels.push(label);
  }
}

function injectPregnancy(rec: any, seedId: string, gestationalWeeks: number) {
  pushResource(rec, "Condition", {
    resourceType: "Condition",
    id: `${seedId}-preg`,
    clinicalStatus: { coding: [{ code: "active" }] },
    verificationStatus: { coding: [{ code: "confirmed" }] },
    code: { text: "Normal pregnancy (finding)" },
    subject: { reference: subjectRef(rec) },
    encounter: { reference: `urn:uuid:${rec.metadata.encounter_id}` }
  });
  const ls = rec.patient_context?.longitudinal_summary;
  if (ls) {
    ls.condition_labels ||= [];
    ls.condition_labels.push("Normal pregnancy (finding)");
  }
  rec.note = `${rec.note}\n\nAddendum: Patient is pregnant; gestational age is ${gestationalWeeks} weeks by dating ultrasound.`;
}

function appendDialogue(rec: any, lines: string[]) {
  rec.transcript = `${rec.transcript}\n\n${lines.join("\n\n")}`;
}

function makeSeed(host: any, alertId: string, n: number): { rec: any; seedId: string } {
  const rec = clone(host);
  const seedId = `seed-${alertId}-${String(n).padStart(2, "0")}`;
  rec.id = `${seedId}::${host.id}`;
  rec.metadata = { ...rec.metadata, seeded: true, seed_alert: alertId, seed_host: host.id };
  return { rec, seedId };
}

const seeds: Seed[] = [];

// ---- opioids-pregnancy: pregnant women on opioids (none exist organically) ----
const OPIOIDS = [
  ["Oxycodone 5 MG Oral Tablet", "oxycodone", "the oxycodone, the five milligram ones"],
  ["Acetaminophen 325 MG / Hydrocodone Bitartrate 5 MG Oral Tablet", "hydrocodone", "the hydrocodone pills"],
  ["Tramadol Hydrochloride 50 MG Oral Tablet", "tramadol", "the tramadol, fifty milligrams"],
  ["Codeine Phosphate 30 MG Oral Tablet", "codeine", "the codeine tablets"]
] as const;
// Hosts for pregnancy seeds must be plausibly-pregnant patients: exclude postpartum,
// pregnancy-loss and lactation encounters (injecting a pregnancy there is incoherent
// and the scanner's negation logic will rightly reject it).
const pregnancyIncompatible = (p: (typeof index)[number]) =>
  /postpartum|post-partum|pregnancy loss|miscarriage|ectopic|lactat/i.test(`${p.visitTitle} ${p.conditions.map((c) => c.label).join(" ")}`);
const opioidHosts = index.filter((p) => p.sex === "female" && p.ageYears >= 18 && p.ageYears <= 45 && !p.pregnancy.pregnant && !pregnancyIncompatible(p) &&
  !p.medications.some((m) => /opioid|oxycodone|hydrocodone|tramadol|codeine|morphine|fentanyl/i.test(`${m.label} ${m.normalized}`))).slice(0, 8);
opioidHosts.forEach((host, i) => {
  const [label, generic, spoken] = OPIOIDS[i % OPIOIDS.length];
  const { rec, seedId } = makeSeed(records[host.sourceIndex], "opioids-pregnancy", i + 1);
  const weeks = 8 + (i % 4) * 3;
  injectPregnancy(rec, seedId, weeks);
  injectMedication(rec, seedId, label, "Take 1 tablet by mouth as needed for pain.");
  appendDialogue(rec, [
    `Clinician: One more thing before we finish — I see ${spoken} on your list. Are you still taking those for the pain?`,
    `Patient: Yes. It says as needed, but honestly it has been most days lately.`,
    `Clinician: Okay. And you know about the pregnancy — we confirmed ${weeks} weeks today. We should not stop the ${generic} suddenly; let's plan a supervised taper.`
  ]);
  seeds.push({ record: rec, recordId: rec.id, alertId: "opioids-pregnancy", note: `seeded: pregnant (${weeks}w) on ${generic}, host ${host.recordId}` });
});

// ---- nsaids-pregnancy-20wk: pregnant women >=20 weeks on NSAIDs (exposure positives) ----
const NSAIDS = [
  ["Ibuprofen 600 MG Oral Tablet", "ibuprofen", "the ibuprofen, the six hundreds"],
  ["Naproxen Sodium 220 MG Oral Tablet", "naproxen", "Aleve"]
] as const;
const nsaidHosts = index.filter((p) => p.sex === "female" && p.ageYears >= 18 && p.ageYears <= 45 && !p.pregnancy.pregnant && !pregnancyIncompatible(p) &&
  !p.medications.some((m) => /ibuprofen|naproxen|nsaid|diclofenac|celecoxib|meloxicam/i.test(`${m.label} ${m.normalized}`)) &&
  !opioidHosts.includes(p)).slice(0, 8);
nsaidHosts.forEach((host, i) => {
  const [label, generic, spoken] = NSAIDS[i % NSAIDS.length];
  const { rec, seedId } = makeSeed(records[host.sourceIndex], "nsaids-pregnancy-20wk", i + 1);
  const weeks = 20 + (i % 3) * 4;
  injectPregnancy(rec, seedId, weeks);
  injectMedication(rec, seedId, label, "Take 1 tablet by mouth as needed for pain.");
  appendDialogue(rec, [
    `Clinician: You're at ${weeks} weeks now. Are you still using ${spoken} for the back pain?`,
    `Patient: Most evenings, yes. It is the only thing that touches it.`
  ]);
  seeds.push({ record: rec, recordId: rec.id, alertId: "nsaids-pregnancy-20wk", note: `seeded: pregnant (${weeks}w) on ${generic}, host ${host.recordId}` });
});

// ---- hctz-skin-cancer: adults on hydrochlorothiazide ----
const hctzHosts = index.filter((p) => p.ageYears >= 30 &&
  !p.medications.some((m) => /hydrochlorothiazide|hctz/i.test(`${m.label} ${m.normalized}`)) &&
  !opioidHosts.includes(p) && !nsaidHosts.includes(p)).slice(0, 8);
hctzHosts.forEach((host, i) => {
  const { rec, seedId } = makeSeed(records[host.sourceIndex], "hctz-skin-cancer", i + 1);
  injectMedication(rec, seedId, "Hydrochlorothiazide 25 MG Oral Tablet", "Take 1 tablet by mouth every morning.");
  appendDialogue(rec, [
    `Clinician: And you're still on the hydrochlorothiazide for your blood pressure, twenty-five milligrams every morning?`,
    `Patient: Every morning with breakfast, yes.${i % 2 === 0 ? " I spend most of the day outside in the garden, so I take it early." : ""}`
  ]);
  seeds.push({ record: rec, recordId: rec.id, alertId: "hctz-skin-cancer", note: `seeded: on HCTZ 25mg, host ${host.recordId}` });
});

// ---- organic positives, audited by hand (see BUILD notes) ----
const organic = [
  { alertId: "nsaids-pregnancy-20wk", sourceIndex: 94, note: "organic: pregnant, first trimester (monitor: below 20-week threshold)" },
  { alertId: "nsaids-pregnancy-20wk", sourceIndex: 97, note: "organic: pregnant ~30 weeks (monitor: OTC exposure check due now)" },
  { alertId: "hctz-skin-cancer", sourceIndex: 122, note: "organic: geriatric patient on HCTZ 25mg" }
].map((o) => ({ ...o, recordId: index[o.sourceIndex].recordId }));

fs.mkdirSync(config.evalDir, { recursive: true });
fs.writeFileSync(path.join(config.evalDir, "seeds.json"), JSON.stringify(seeds.map((s) => s.record), null, 2));
const groundTruth: Record<string, { recordId: string; source: string; note: string }[]> = {};
for (const s of seeds) {
  groundTruth[s.alertId] ||= [];
  groundTruth[s.alertId].push({ recordId: s.recordId, source: "seeded", note: s.note });
}
for (const o of organic) {
  groundTruth[o.alertId] ||= [];
  groundTruth[o.alertId].push({ recordId: o.recordId, source: "organic", note: o.note });
}
fs.writeFileSync(path.join(config.evalDir, "ground-truth.json"), JSON.stringify(groundTruth, null, 2));
console.log(`Wrote ${seeds.length} seeded records and ${organic.length} organic labels`);
for (const [alertId, entries] of Object.entries(groundTruth)) console.log(`  ${alertId}: ${entries.length} positives (${entries.filter((e) => e.source === "seeded").length} seeded, ${entries.filter((e) => e.source === "organic").length} organic)`);
