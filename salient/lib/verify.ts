import { sameSpan } from "./normalize";
import { patientResourceIds } from "./patient-index";
import { Citation, PatientIndex } from "./types";

export function mechanicallyVerifyCitation(patient: PatientIndex, citation: Citation) {
  if (citation.type === "transcript") return sameSpan(patient.transcript, citation.quote);
  return patientResourceIds(patient).has(citation.resourceId);
}

export function transcriptOffset(transcript: string, quote: string) {
  const idx = transcript.toLowerCase().indexOf(quote.toLowerCase());
  return idx < 0 ? undefined : { start: idx, end: idx + quote.length };
}
