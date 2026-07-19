import fs from "node:fs";
import { PatientIndex, Evidence } from "./types";
import { canonicalDrugTerms, normalizeText } from "./normalize";

function displayName(patient: any) {
  const n = patient?.name?.[0];
  return [n?.prefix?.[0], ...(n?.given || []), n?.family].filter(Boolean).join(" ").replace(/\d+/g, "");
}

function ageAt(birthDate: string, date: string) {
  const b = new Date(birthDate);
  const d = new Date(date);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

function resourceText(r: any) {
  return r?.code?.text || r?.code?.coding?.[0]?.display || r?.medicationCodeableConcept?.text || r?.medicationCodeableConcept?.coding?.[0]?.display || r?.display || "";
}

function allResources(encounter: any) {
  const related = encounter?.encounter_fhir?.related_resources || {};
  return Object.values(related).flat() as any[];
}

function medicationEvidence(encounter: any): Evidence[] {
  const out = new Map<string, Evidence>();
  for (const label of encounter.patient_context?.longitudinal_summary?.medication_labels || []) {
    out.set(`label:${label}`, { kind: "medication", label, normalized: canonicalDrugTerms(label).join("|") });
  }
  for (const r of allResources(encounter).filter((x) => x.resourceType === "MedicationRequest")) {
    const label = resourceText(r);
    out.set(`MedicationRequest:${r.id}`, { kind: "medication", label, normalized: canonicalDrugTerms(label).join("|"), resourceType: "MedicationRequest", resourceId: r.id });
  }
  return [...out.values()];
}

function conditionEvidence(encounter: any): Evidence[] {
  const out = new Map<string, Evidence>();
  for (const label of encounter.patient_context?.longitudinal_summary?.condition_labels || []) {
    out.set(`label:${label}`, { kind: "condition", label, normalized: normalizeText(label) });
  }
  for (const r of allResources(encounter).filter((x) => x.resourceType === "Condition")) {
    const label = resourceText(r);
    out.set(`Condition:${r.id}`, { kind: "condition", label, normalized: normalizeText(label), resourceType: "Condition", resourceId: r.id });
  }
  return [...out.values()];
}

function observationEvidence(encounter: any) {
  return allResources(encounter).filter((x) => x.resourceType === "Observation").map((r) => ({
    kind: "observation" as const,
    label: resourceText(r),
    normalized: normalizeText(resourceText(r)),
    resourceType: "Observation",
    resourceId: r.id,
    loinc: r.code?.coding?.find((c: any) => c.system === "http://loinc.org")?.code,
    value: typeof r.valueQuantity?.value === "number" ? r.valueQuantity.value : undefined,
    unit: r.valueQuantity?.unit
  }));
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40
};

function parseWeeksToken(token: string): number | undefined {
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  return NUMBER_WORDS[token.toLowerCase()];
}

/** Extracts gestational age from clinical prose: "nine to ten weeks from her last menstrual period", "10 weeks gestation", "first-trimester". */
export function extractGestation(text: string): { weeks?: number; trimester?: 1 | 2 | 3; sourceSpan?: string } {
  const token = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)";
  const patterns = [
    // "nine to ten weeks from her last menstrual period" / "ten weeks since my last period"
    new RegExp(`${token}(?:\\s*(?:to|-|–)\\s*${token})?\\s*weeks?\\s+(?:from|since|by|past)\\s+(?:her |my |the )?(?:last menstrual period|last period|lmp)`, "i"),
    // "10 weeks gestation" / "nine weeks pregnant" / "ten weeks along"
    new RegExp(`${token}(?:\\s*(?:to|-|–)\\s*${token})?\\s*weeks?['’]?\\s*(?:of\\s+)?(?:gestation|gestational age|pregnant|along)`, "i"),
    // "estimates nine to ten weeks"
    new RegExp(`estimates?\\s+${token}(?:\\s*(?:to|-|–)\\s*${token})?\\s*weeks?`, "i"),
    // "at 22 weeks' gestation" style with explicit gestational context word before
    new RegExp(`gestational age (?:of|is|at)?\\s*${token}(?:\\s*(?:to|-|–)\\s*${token})?\\s*weeks?`, "i")
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const a = parseWeeksToken(m[1]);
      const b = m[2] ? parseWeeksToken(m[2]) : undefined;
      const weeks = a !== undefined && b !== undefined ? Math.round((a + b) / 2) : a;
      if (weeks !== undefined) return { weeks, sourceSpan: m[0] };
    }
  }
  const tri = text.match(/(first|second|third)[-\s]trimester/i);
  if (tri) {
    const trimester = ({ first: 1, second: 2, third: 3 } as const)[tri[1].toLowerCase() as "first" | "second" | "third"];
    return { trimester, sourceSpan: tri[0] };
  }
  return {};
}

// Conditions/visits that mention pregnancy but mean the patient is NOT currently pregnant.
const PREGNANCY_NEGATION = /postpartum|post-partum|pregnancy loss|miscarriage|ectopic|abortion|termination of pregnancy/i;

function pregnancyEvidence(conditions: Evidence[], observations: ReturnType<typeof observationEvidence>, visitTitle: string, transcript: string, note: string) {
  const evidence: Evidence[] = [];
  // Postpartum or pregnancy-loss encounters are not current pregnancies, even when a
  // historical "Normal pregnancy" condition remains on the problem list.
  const isHistorical = (label: string) => /\b(past|history of|prior|previous)\b/i.test(label);
  const negated = PREGNANCY_NEGATION.test(visitTitle) || conditions.some((c) => PREGNANCY_NEGATION.test(c.label) && !isHistorical(c.label));
  if (negated) return { pregnant: false, gestationalWeeks: undefined, trimester: undefined, gestationSource: undefined, evidence };
  for (const c of conditions) {
    if (/(pregnancy|prenatal|gestation)/i.test(c.label) && !/past pregnancy history/i.test(c.label)) evidence.push(c);
  }
  if (/(prenatal|pregnancy)/i.test(visitTitle)) evidence.push({ kind: "population", label: visitTitle, normalized: normalizeText(visitTitle) });
  let gestationalWeeks: number | undefined;
  let trimester: 1 | 2 | 3 | undefined;
  let gestationSource: string | undefined;
  for (const o of observations) {
    if (/gestational age|weeks gestation/i.test(o.label) && typeof o.value === "number") {
      gestationalWeeks = o.value;
      evidence.push(o);
    }
  }
  if (gestationalWeeks === undefined) {
    // The clinical note states gestational age more reliably than conversation; check it first.
    for (const text of [note, transcript]) {
      const g = extractGestation(text);
      if (g.weeks !== undefined || g.trimester !== undefined) {
        gestationalWeeks = g.weeks;
        trimester = g.trimester;
        gestationSource = g.sourceSpan;
        break;
      }
    }
  }
  if (gestationalWeeks !== undefined && trimester === undefined) trimester = gestationalWeeks < 14 ? 1 : gestationalWeeks < 28 ? 2 : 3;
  // Pregnancy requires structured or visit-level evidence; a stray "pregnant" in
  // conversation (contraception counseling, negative tests) is not enough.
  return { pregnant: evidence.length > 0, gestationalWeeks, trimester, gestationSource, evidence };
}

export function buildPatientIndexFromRecords(records: any[]): PatientIndex[] {
  return records.map((encounter, sourceIndex) => {
    const patient = encounter.patient_context?.patient || {};
    const date = encounter.metadata?.date || encounter.encounter_fhir?.encounter?.period?.start || new Date().toISOString();
    const medications = medicationEvidence(encounter);
    const conditions = conditionEvidence(encounter);
    const observations = observationEvidence(encounter);
    const visitTitle = encounter.metadata?.visit_title || encounter.metadata?.visit_type || encounter.encounter_fhir?.encounter?.type?.[0]?.text || "Encounter";
    const participant = encounter.encounter_fhir?.encounter?.participant?.[0]?.individual?.display;
    const clinic = encounter.encounter_fhir?.encounter?.serviceProvider?.display || encounter.encounter_fhir?.encounter?.location?.[0]?.location?.display || "Clinic";
    return {
      sourceIndex,
      recordId: encounter.id,
      patientId: patient.id || encounter.metadata?.patient_id,
      encounterId: encounter.encounter_fhir?.encounter?.id || encounter.metadata?.encounter_id,
      name: displayName(patient) || encounter.encounter_fhir?.encounter?.subject?.display || "Unknown patient",
      ageYears: ageAt(patient.birthDate, date),
      sex: patient.gender || "unknown",
      visitTitle,
      encounterDate: date,
      prescriber: participant || clinic,
      clinic,
      medications,
      conditions,
      observations,
      pregnancy: pregnancyEvidence(conditions, observations, visitTitle, encounter.transcript || "", encounter.note || ""),
      transcript: encounter.transcript || "",
      note: encounter.note || "",
      raw: encounter
    };
  });
}

export function loadPatientIndex(path: string): PatientIndex[] {
  const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  return buildPatientIndexFromRecords(Array.isArray(parsed) ? parsed : parsed.records);
}

export function patientResourceIds(patient: PatientIndex) {
  const ids = new Set<string>([patient.patientId, patient.encounterId]);
  for (const r of allResources(patient.raw)) if (r?.id) ids.add(r.id);
  return ids;
}
