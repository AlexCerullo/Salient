import fs from "node:fs";
import { PatientIndex, Evidence } from "./types";
import { canonicalDrugTerms, normalizeText, normalizedIncludes } from "./normalize";

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

function pregnancyEvidence(conditions: Evidence[], observations: ReturnType<typeof observationEvidence>, visitTitle: string, transcript: string) {
  const evidence: Evidence[] = [];
  for (const c of conditions) {
    if (/(pregnancy|prenatal|gestation)/i.test(c.label) && !/past pregnancy history/i.test(c.label)) evidence.push(c);
  }
  if (/(prenatal|pregnancy)/i.test(visitTitle)) evidence.push({ kind: "population", label: visitTitle, normalized: normalizeText(visitTitle) });
  let gestationalWeeks: number | undefined;
  for (const o of observations) {
    if (/gestational age|weeks gestation/i.test(o.label) && typeof o.value === "number") {
      gestationalWeeks = o.value;
      evidence.push(o);
    }
  }
  const m = transcript.match(/(\d{1,2})\s*(?:weeks|wks)/i);
  if (!gestationalWeeks && m) gestationalWeeks = Number(m[1]);
  return { pregnant: evidence.length > 0 || normalizedIncludes(transcript, "pregnant"), gestationalWeeks, evidence };
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
      pregnancy: pregnancyEvidence(conditions, observations, visitTitle, encounter.transcript || ""),
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
