import { describe, expect, it } from "vitest";
import { cscSchema } from "../lib/csc";
import { getCuratedCsc } from "../lib/alerts";

describe("CSC schema", () => {
  it("validates curated alert criteria", () => {
    expect(cscSchema.parse(getCuratedCsc("opioids-pregnancy")).alertId).toBe("opioids-pregnancy");
  });
  it("rejects invalid severity", () => {
    expect(() => cscSchema.parse({ ...getCuratedCsc("opioids-pregnancy"), severityTier: 4 })).toThrow();
  });
});
