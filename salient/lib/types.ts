export type Citation =
  | { type: "fhir"; resourceType: string; resourceId: string }
  | { type: "transcript"; quote: string };

export type Evidence = {
  kind: "medication" | "condition" | "observation" | "transcript" | "population";
  label: string;
  normalized: string;
  resourceType?: string;
  resourceId?: string;
};

export type PatientIndex = {
  sourceIndex: number;
  recordId: string;
  patientId: string;
  encounterId: string;
  name: string;
  ageYears: number;
  sex: "male" | "female" | "other" | "unknown";
  visitTitle: string;
  encounterDate: string;
  prescriber: string;
  clinic: string;
  medications: Evidence[];
  conditions: Evidence[];
  observations: (Evidence & { loinc?: string; value?: number; unit?: string })[];
  pregnancy: { pregnant: boolean; gestationalWeeks?: number; trimester?: 1 | 2 | 3; gestationSource?: string; evidence: Evidence[] };
  transcript: string;
  note: string;
  raw: any;
};

export type ScanCandidate = {
  patient: PatientIndex;
  matchedEvidence: Evidence[];
  reasons: string[];
  /** exposure = documented drug match; monitor = population at risk (e.g. OTC drug not chartable, or threshold reached later) */
  matchType: "exposure" | "monitor";
};

export type ScanExclusion = {
  sourceIndex: number;
  patientId: string;
  name: string;
  reasons: string[];
  nearMiss?: string;
};

export type ScanResult = {
  total: number;
  candidates: ScanCandidate[];
  exclusions: ScanExclusion[];
  counts: Record<string, number>;
};

export type AdjudicatedCase = {
  caseId: string;
  alertId: string;
  patient: Pick<PatientIndex, "sourceIndex" | "patientId" | "encounterId" | "name" | "ageYears" | "sex" | "visitTitle" | "prescriber" | "clinic">;
  verdict: "actionable" | "monitor" | "dismiss";
  actionable: boolean;
  matchType: "exposure" | "monitor";
  priority: "high" | "medium" | "low";
  rationale: string;
  monitorNote?: string;
  claims: { text: string; citation: Citation; verified: boolean; supportVerified?: boolean; dropped?: boolean; reason?: string }[];
  transcriptEscalation?: string;
  draftedAction: string;
  matchedEvidence: Evidence[];
  routeTo: string;
};

export type PipelineRun = {
  alertId: string;
  title: string;
  createdAt: string;
  csc: any;
  funnel: { total: number; scanCandidates: number; actionable: number; monitored: number };
  scan: Omit<ScanResult, "candidates"> & { candidates: { sourceIndex: number; patientId: string; name: string; reasons: string[]; matchedEvidence: Evidence[]; matchType: "exposure" | "monitor" }[] };
  timings?: Record<string, number>;
  cases: AdjudicatedCase[];
  routed: Record<string, string[]>;
  warnings: string[];
};
