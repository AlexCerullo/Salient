import crypto from "node:crypto";
import { CSC } from "./csc";
import { callClaude, jsonFromText } from "./llm";
import { mechanicallyVerifyCitation } from "./verify";
import { AdjudicatedCase, ScanCandidate } from "./types";

/** Deterministic fallback when no API key is available or the LLM output is unusable.
 *  Conservative by design: builds claims only from mechanically-known evidence and
 *  never marks a monitor-pathway candidate actionable. */
function fallbackCase(alertId: string, csc: CSC, candidate: ScanCandidate): AdjudicatedCase {
  const p = candidate.patient;
  const meds = candidate.matchedEvidence.filter((e) => e.kind === "medication");
  const preg = p.pregnancy.evidence.find((e) => e.resourceId) || p.pregnancy.evidence[0];
  const claims: any[] = [];
  for (const med of meds) {
    claims.push({
      text: `${p.name} has a documented exposure: ${med.label}.`,
      citation: med.resourceId ? { type: "fhir", resourceType: med.resourceType, resourceId: med.resourceId } : { type: "transcript", quote: med.label }
    });
  }
  if (csc.population.pregnancy && p.pregnancy.pregnant && preg) {
    claims.push({
      text: `${p.name} meets the pregnancy/prenatal population criterion.`,
      citation: preg.resourceId ? { type: "fhir", resourceType: preg.resourceType, resourceId: preg.resourceId } : { type: "transcript", quote: preg.label }
    });
  }
  const isExposure = candidate.matchType === "exposure";
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
    verdict: isExposure ? "actionable" : "monitor",
    actionable: isExposure,
    matchType: candidate.matchType,
    priority: csc.severityTier === 1 ? "high" : "medium",
    rationale: isExposure
      ? `Deterministic match: ${csc.rationale}`
      : `Population matches but no documented exposure; deterministic fallback recommends monitoring. ${csc.rationale}`,
    monitorNote: isExposure ? undefined : "Re-check when alert criteria become applicable (deterministic fallback).",
    draftedAction: csc.recommendedActionTemplate
      .replaceAll("{patient}", p.name)
      .replaceAll("{medications}", meds.map((e) => e.label).join("; ") || csc.drugs.names.join("/"))
      .replaceAll("{prescriber}", p.prescriber),
    matchedEvidence: candidate.matchedEvidence,
    routeTo: p.prescriber,
    claims
  };
}

function buildPrompt(csc: CSC, candidate: ScanCandidate) {
  const p = candidate.patient;
  return `You are the adjudicator inside Salient, a drug-safety surveillance agent. A deterministic scanner flagged ONE patient as a candidate for an FDA safety alert. Decide what the clinician should do. A human clinician reviews everything you output; nothing auto-executes.

## Verdict definitions
- "actionable": the alert applies to this patient NOW and the clinician should act. Use only when evidence supports it.
- "monitor": the alert does not require action today, but will or may become applicable (e.g., a gestational-age threshold not yet reached, an exposure that must be re-checked later). Say precisely when/what to re-check in "monitorNote". Over-alerting causes alert fatigue; choosing "monitor" when action is not yet due is a correct, valuable outcome.
- "dismiss": the alert does not apply to this patient (false positive from the scanner). Explain why in "rationale".

## Candidate match type: ${candidate.matchType}
${candidate.matchType === "monitor"
    ? `This patient has NO documented prescription for the alert drugs, but matches the at-risk population and the drugs are available over the counter, so the chart cannot rule out use. Check the transcript for any evidence of actual use of the alert drugs (including brand names). If there is real evidence of use, treat it as an exposure. If not, the correct verdict is usually "monitor" (or "dismiss" if the population match itself is wrong): note when the risk window starts and what to tell the patient preemptively.`
    : `This patient has a documented drug exposure matching the alert.`}

## Rules
1. Weigh the ambient transcript AGAINST the structured chart. Charts often say "PRN" or list a medication without frequency, while the conversation reveals actual intensity, frequency, or intent. When the transcript reveals higher risk than the chart implies (e.g., near-daily use of a PRN drug, intent to stop abruptly, undisclosed OTC use, heavy sun exposure), escalate priority and put a short explanation in "transcriptEscalation".
2. EVERY claim must carry exactly one citation:
   - {"type":"fhir","resourceType":...,"resourceId":...} — the id must be copied exactly from the structured resources provided below.
   - {"type":"transcript","quote":...} — the quote must be a VERBATIM, character-exact substring of the transcript below (copy/paste it; do not paraphrase, do not fix typos, keep punctuation). Prefer short, decisive spans (one sentence or less is ideal).
   A mechanical verifier re-checks each citation against the record and silently DROPS any claim whose citation does not match. An unverifiable claim is worthless: it weakens the case.
3. Make claims atomic: one fact per claim. Cover (a) the exposure or its absence, (b) the population criterion, (c) any risk-modifying facts from the conversation.
4. "draftedAction": 2-4 sentences, concrete and safe. Name who does what (contact patient, coordinate with which specialist, what to counsel). Include what NOT to do when relevant (e.g., do not stop opioids abruptly in pregnancy). Written so the reviewing clinician can approve it as-is.
5. "rationale": 1-3 sentences, clinical, specific to THIS patient. No generic warnings.
6. "priority": "high" only for tier-1 harms applying now; "medium" for real but less urgent action; "low" for routine counseling.

## FDA alert as computable criteria (CSC)
${JSON.stringify(csc, null, 2)}

## Patient (structured)
${JSON.stringify({
    name: p.name,
    ageYears: p.ageYears,
    sex: p.sex,
    visitTitle: p.visitTitle,
    encounterDate: p.encounterDate,
    pregnancy: p.pregnancy.pregnant ? { pregnant: true, gestationalWeeks: p.pregnancy.gestationalWeeks, trimester: p.pregnancy.trimester, statedAs: p.pregnancy.gestationSource } : { pregnant: false },
    medications: p.medications.map((m) => ({ label: m.label, resourceType: m.resourceType, resourceId: m.resourceId })),
    conditions: p.conditions.map((c) => ({ label: c.label, resourceType: c.resourceType, resourceId: c.resourceId })),
    observations: p.observations.map((o) => ({ label: o.label, value: o.value, unit: o.unit, resourceType: o.resourceType, resourceId: o.resourceId })),
    scannerReasons: candidate.reasons
  }, null, 2)}

## Clinical note (excerpt)
${p.note.slice(0, 5000)}

## Ambient transcript (verbatim; quotes must be copied exactly from here)
${p.transcript}

## Output
Return ONLY strict JSON:
{
  "verdict": "actionable" | "monitor" | "dismiss",
  "priority": "high" | "medium" | "low",
  "rationale": string,
  "claims": [{ "text": string, "citation": {"type":"fhir","resourceType":string,"resourceId":string} | {"type":"transcript","quote":string} }],
  "transcriptEscalation": string (omit if the transcript adds nothing beyond the chart),
  "monitorNote": string (required when verdict is "monitor": what to re-check and when),
  "draftedAction": string
}`;
}

export async function adjudicateCandidate(alertId: string, csc: CSC, candidate: ScanCandidate): Promise<{ case: AdjudicatedCase; warnings: string[] }> {
  const p = candidate.patient;
  const warnings: string[] = [];
  const llm = await callClaude(buildPrompt(csc, candidate), 2600);
  if (llm.warning) warnings.push(llm.warning);
  let parsed: any;
  try {
    parsed = llm.text ? jsonFromText(llm.text) : undefined;
  } catch (err: any) {
    warnings.push(`LLM adjudication invalid for ${p.name}; deterministic fallback used: ${err.message}`);
  }
  const base = fallbackCase(alertId, csc, candidate);
  const usingLlm = parsed && ["actionable", "monitor", "dismiss"].includes(parsed.verdict);
  if (!usingLlm && !warnings.length) warnings.push(`LLM verdict missing/invalid for ${p.name}; deterministic fallback used`);
  const rawClaims = Array.isArray(parsed?.claims) && parsed.claims.length ? parsed.claims : base.claims;
  const allClaims = rawClaims.map((claim: any) => {
    const verified = claim?.citation ? mechanicallyVerifyCitation(p, claim.citation) : false;
    return { ...claim, verified, supportVerified: verified, dropped: !verified, reason: verified ? undefined : "mechanical citation verification failed" };
  });
  const verifiedClaims = allClaims.filter((claim: any) => claim.verified);
  const droppedCount = allClaims.length - verifiedClaims.length;
  if (droppedCount > 0) warnings.push(`${droppedCount} claim(s) dropped for ${p.name}: citation failed mechanical verification`);
  const verdict: AdjudicatedCase["verdict"] = usingLlm ? parsed.verdict : base.verdict;
  // A case can only be actionable if at least one claim survived verification.
  const keyClaimsOk = verifiedClaims.length > 0;
  const adjudicated: AdjudicatedCase = {
    ...base,
    // An actionable verdict without a single verified claim is demoted to monitor.
    verdict: keyClaimsOk || verdict !== "actionable" ? verdict : "monitor",
    actionable: keyClaimsOk && verdict === "actionable",
    priority: parsed?.priority && ["high", "medium", "low"].includes(parsed.priority) ? parsed.priority : base.priority,
    rationale: parsed?.rationale || base.rationale,
    monitorNote: parsed?.monitorNote || (verdict === "monitor" ? base.monitorNote : undefined),
    transcriptEscalation: typeof parsed?.transcriptEscalation === "string" && parsed.transcriptEscalation.trim() ? parsed.transcriptEscalation : undefined,
    draftedAction: parsed?.draftedAction || base.draftedAction,
    claims: verifiedClaims
  };
  return { case: adjudicated, warnings };
}
