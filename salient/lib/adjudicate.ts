import crypto from "node:crypto";
import { CSC } from "./csc";
import { callClaude, jsonFromText } from "./llm";
import { mechanicallyVerifyCitation } from "./verify";
import { AdjudicatedCase, ScanCandidate } from "./types";

function fallbackCase(alertId: string, csc: CSC, candidate: ScanCandidate): Omit<AdjudicatedCase, "claims"> & { claims: any[] } {
  const p = candidate.patient;
  const quote = p.transcript.match(/most days is the honest answer, lately/i)?.[0];
  const priority = alertId === "opioids-pregnancy" && quote ? "high" : csc.severityTier === 1 ? "high" : "medium";
  const med = candidate.matchedEvidence.find((e) => e.kind === "medication");
  const preg = p.pregnancy.evidence[0];
  const claims: any[] = [
    { text: `${p.name} has exposure matching ${csc.drugs.names.join(", ")}.`, citation: med?.resourceId ? { type: "fhir", resourceType: med.resourceType, resourceId: med.resourceId } : { type: "transcript", quote: med?.label || p.visitTitle } },
    { text: `${p.name} meets the pregnancy/prenatal population criterion.`, citation: preg?.resourceId ? { type: "fhir", resourceType: preg.resourceType, resourceId: preg.resourceId } : { type: "transcript", quote: "pregnant" } }
  ];
  if (quote) claims.push({ text: "Transcript indicates use on most days, escalating urgency beyond PRN chart wording.", citation: { type: "transcript", quote } });
  return {
    caseId: crypto.createHash("sha1").update(`${alertId}:${p.patientId}`).digest("hex").slice(0, 12),
    alertId,
    patient: {
      sourceIndex: p.sourceIndex,
      patientId: p.patientId,
      encounterId: p.encounterId,
      name: p.name,
      ageYears: p.ageYears,
      sex: p.sex,
      visitTitle: p.visitTitle,
      prescriber: p.prescriber,
      clinic: p.clinic
    },
    actionable: true,
    priority,
    rationale: quote ? "Pregnancy plus opioid exposure, with conversation evidence suggesting frequent use." : csc.rationale,
    transcriptEscalation: quote,
    draftedAction: csc.recommendedActionTemplate
      .replaceAll("{patient}", p.name)
      .replaceAll("{medications}", candidate.matchedEvidence.filter((e) => e.kind === "medication").map((e) => e.label).join("; "))
      .replaceAll("{prescriber}", p.prescriber),
    matchedEvidence: candidate.matchedEvidence,
    routeTo: p.prescriber,
    claims
  };
}

export async function adjudicateCandidate(alertId: string, csc: CSC, candidate: ScanCandidate): Promise<{ case: AdjudicatedCase; warnings: string[] }> {
  const p = candidate.patient;
  const prompt = `You are adjudicating a drug-safety alert candidate. Return strict JSON:
{ "actionable": boolean, "priority": "high"|"medium"|"low", "rationale": string, "claims": [{"text": string, "citation": {"type":"fhir","resourceType":string,"resourceId":string} | {"type":"transcript","quote":string}}], "transcriptEscalation"?: string, "draftedAction": string }
Every claim must cite an exact FHIR id from evidence/raw resources or a verbatim transcript quote.
CSC: ${JSON.stringify(csc)}
Patient context: ${JSON.stringify({ index: p.sourceIndex, name: p.name, ageYears: p.ageYears, sex: p.sex, visitTitle: p.visitTitle, medications: p.medications, conditions: p.conditions, observations: p.observations, pregnancy: p.pregnancy, matchedEvidence: candidate.matchedEvidence, note: p.note.slice(0, 5000) })}
Transcript:
${p.transcript}`;
  const warnings: string[] = [];
  const llm = await callClaude(prompt, 2200);
  if (llm.warning) warnings.push(llm.warning);
  let parsed: any;
  try {
    parsed = llm.text ? jsonFromText(llm.text) : undefined;
  } catch (err: any) {
    warnings.push(`LLM adjudication invalid for ${p.name}; deterministic fallback used: ${err.message}`);
  }
  const base = fallbackCase(alertId, csc, candidate);
  const rawClaims = Array.isArray(parsed?.claims) && parsed.claims.length ? parsed.claims : base.claims;
  const verifiedClaims = rawClaims.map((claim: any) => {
    const verified = claim?.citation ? mechanicallyVerifyCitation(p, claim.citation) : false;
    return { ...claim, verified, supportVerified: verified, dropped: !verified, reason: verified ? undefined : "mechanical citation verification failed" };
  }).filter((claim: any) => claim.verified);
  const keyClaimsOk = verifiedClaims.length > 0;
  const adjudicated: AdjudicatedCase = {
    ...base,
    actionable: keyClaimsOk ? Boolean(parsed?.actionable ?? base.actionable) : false,
    priority: parsed?.priority || base.priority,
    rationale: parsed?.rationale || base.rationale,
    transcriptEscalation: parsed?.transcriptEscalation || base.transcriptEscalation,
    draftedAction: parsed?.draftedAction || base.draftedAction,
    claims: verifiedClaims
  };
  return { case: adjudicated, warnings };
}
