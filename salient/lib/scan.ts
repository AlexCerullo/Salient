import { CSC } from "./csc";
import { hasTerm, normalizedIncludes } from "./normalize";
import { Evidence, PatientIndex, ScanCandidate, ScanResult } from "./types";

function drugMatches(patient: PatientIndex, names: string[]) {
  const matched: Evidence[] = [];
  for (const med of patient.medications) {
    if (names.some((name) => hasTerm(`${med.label} ${med.normalized}`, name))) matched.push(med);
  }
  return matched;
}

function conditionMatches(patient: PatientIndex, terms: string[]) {
  return terms.flatMap((term) => patient.conditions.filter((c) => normalizedIncludes(c.label, term)));
}

function labCriteriaMatches(patient: PatientIndex, criteria: NonNullable<CSC["labCriteria"]>) {
  const matched: Evidence[] = [];
  const failed: string[] = [];
  for (const c of criteria) {
    const obs = patient.observations.find((o) => (!c.loinc || o.loinc === c.loinc) && normalizedIncludes(o.label, c.nameContains) && typeof o.value === "number");
    if (!obs) {
      failed.push(`missing lab ${c.nameContains}`);
      continue;
    }
    const v = obs.value!;
    const ok = c.op === "<" ? v < c.value : c.op === "<=" ? v <= c.value : c.op === ">" ? v > c.value : v >= c.value;
    if (ok) matched.push(obs);
    else failed.push(`${obs.label} ${v}${obs.unit || ""} does not meet ${c.op} ${c.value}`);
  }
  return { matched, failed };
}

function pairMatches(patient: PatientIndex, pairs: NonNullable<CSC["interactionPairs"]>) {
  const matched: Evidence[] = [];
  const failed: string[] = [];
  for (const pair of pairs) {
    const a = drugMatches(patient, pair.a);
    const b = drugMatches(patient, pair.b);
    if (a.length && b.length) matched.push(...a, ...b);
    else failed.push(`missing interaction pair ${pair.a.join("/")} + ${pair.b.join("/")}`);
  }
  return { matched, failed };
}

export function scanPatients(csc: CSC, patients: PatientIndex[]): ScanResult {
  const candidates: ScanCandidate[] = [];
  const exclusions: ScanResult["exclusions"] = [];
  const counts: Record<string, number> = { drugMatched: 0, populationMatched: 0, labMatched: 0, interactionMatched: 0, monitorMatched: 0 };
  for (const patient of patients) {
    const reasons: string[] = [];
    const matchedEvidence: Evidence[] = [];
    const drugMatched = drugMatches(patient, csc.drugs.names);
    if (drugMatched.length) {
      counts.drugMatched++;
      matchedEvidence.push(...drugMatched);
      reasons.push(`matched drug: ${[...new Set(drugMatched.map((m) => m.label))].join("; ")}`);
    }

    const populationFailures: string[] = [];
    if (typeof csc.population.minAgeYears === "number" && patient.ageYears < csc.population.minAgeYears) populationFailures.push(`age ${patient.ageYears} below ${csc.population.minAgeYears}`);
    if (typeof csc.population.maxAgeYears === "number" && patient.ageYears > csc.population.maxAgeYears) populationFailures.push(`age ${patient.ageYears} above ${csc.population.maxAgeYears}`);
    if (csc.population.sex && patient.sex !== csc.population.sex) populationFailures.push(`sex is ${patient.sex}, not ${csc.population.sex}`);
    if (csc.population.pregnancy === true && !patient.pregnancy.pregnant) populationFailures.push("not pregnant");
    if (csc.population.pregnancy === false && patient.pregnancy.pregnant) populationFailures.push("pregnant");
    if (typeof csc.population.minGestationalWeeks === "number" && (patient.pregnancy.gestationalWeeks ?? 0) < csc.population.minGestationalWeeks) populationFailures.push(`gestational age ${patient.pregnancy.gestationalWeeks ?? "unknown"} below ${csc.population.minGestationalWeeks} weeks`);
    const required = conditionMatches(patient, csc.population.requiredConditions || []);
    if ((csc.population.requiredConditions || []).length && !required.length) populationFailures.push(`missing condition: ${(csc.population.requiredConditions || []).join(", ")}`);
    const excluded = conditionMatches(patient, csc.population.excludedConditions || []);
    if (excluded.length) populationFailures.push(`excluded condition: ${excluded.map((x) => x.label).join(", ")}`);
    if (!populationFailures.length) {
      counts.populationMatched++;
      matchedEvidence.push(...patient.pregnancy.evidence, ...required);
      if (csc.population.pregnancy) reasons.push("matched population: pregnant/prenatal evidence present");
    }

    const lab = csc.labCriteria?.length ? labCriteriaMatches(patient, csc.labCriteria) : { matched: [], failed: [] };
    if (!lab.failed.length) {
      counts.labMatched++;
      matchedEvidence.push(...lab.matched);
    }
    const pairs = csc.interactionPairs?.length ? pairMatches(patient, csc.interactionPairs) : { matched: [], failed: [] };
    if (!pairs.failed.length) {
      counts.interactionMatched++;
      matchedEvidence.push(...pairs.matched);
    }

    const exposureCandidate = drugMatched.length > 0 && !populationFailures.length && !lab.failed.length && !pairs.failed.length;
    // Monitor pathway: the drug is OTC (self-medication invisible to the med list) and the alert
    // carries a gestational-age threshold. Population-matched pregnant patients are surfaced for
    // monitoring even without a documented prescription — adjudication decides if action is due now.
    const monitorEligible = !exposureCandidate &&
      !drugMatched.length &&
      csc.drugs.otcAvailable === true &&
      typeof csc.population.monitorFromGestationalWeeks === "number" &&
      csc.population.pregnancy === true &&
      patient.pregnancy.pregnant &&
      !populationFailures.length &&
      !lab.failed.length && !pairs.failed.length;
    if (exposureCandidate) {
      candidates.push({ patient, matchedEvidence, reasons, matchType: "exposure" });
    } else if (monitorEligible) {
      counts.monitorMatched = (counts.monitorMatched || 0) + 1;
      const t = csc.population.monitorFromGestationalWeeks!;
      const gw = patient.pregnancy.gestationalWeeks;
      const gestationLabel = gw !== undefined ? `~${gw} weeks` : patient.pregnancy.trimester ? `trimester ${patient.pregnancy.trimester}` : "gestational age not yet documented";
      const timing = gw !== undefined && gw >= t ? `at/after the ${t}-week threshold — exposure check due NOW` : `below the ${t}-week threshold — becomes applicable at ${t} weeks`;
      reasons.push(`matched population: pregnant (${gestationLabel}), ${timing}`);
      reasons.push(`no documented prescription, but ${csc.drugs.names.slice(0, 3).join("/")} are available OTC — chart absence does not rule out use`);
      candidates.push({ patient, matchedEvidence, reasons, matchType: "monitor" });
    } else {
      const nearMiss = drugMatched.length && populationFailures.includes("not pregnant") ? `on ${drugMatched[0].label} but not pregnant` : drugMatched.length ? `drug matched but ${[...populationFailures, ...lab.failed, ...pairs.failed].join("; ")}` : undefined;
      exclusions.push({
        sourceIndex: patient.sourceIndex,
        patientId: patient.patientId,
        name: patient.name,
        reasons: [...(drugMatched.length ? reasons : ["no matching drug exposure"]), ...populationFailures, ...lab.failed, ...pairs.failed],
        nearMiss
      });
    }
  }
  return { total: patients.length, candidates, exclusions, counts };
}
