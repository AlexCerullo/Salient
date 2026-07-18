import { describe, expect, it } from "vitest";
import { loadPatientIndex } from "../lib/patient-index";
import { config } from "../lib/config";
import { mechanicallyVerifyCitation } from "../lib/verify";

describe("citation verification", () => {
  const patient = loadPatientIndex(config.data25Path)[18];
  it("accepts verbatim transcript quotes", () => {
    expect(mechanicallyVerifyCitation(patient, { type: "transcript", quote: "most days is the honest answer, lately" })).toBe(true);
  });
  it("rejects fabricated transcript quotes and FHIR ids", () => {
    expect(mechanicallyVerifyCitation(patient, { type: "transcript", quote: "this quote is not in the transcript" })).toBe(false);
    expect(mechanicallyVerifyCitation(patient, { type: "fhir", resourceType: "Condition", resourceId: "nope" })).toBe(false);
  });
});
