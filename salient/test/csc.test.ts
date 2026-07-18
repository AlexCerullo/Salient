import { describe, expect, it } from "vitest";
import { cscSchema } from "../lib/csc";
import { getAlert } from "../lib/alerts";

describe("CSC schema", () => {
  it("validates curated alert criteria", () => {
    expect(cscSchema.parse(getAlert("opioids-pregnancy").csc).alertId).toBe("opioids-pregnancy");
  });
  it("rejects invalid severity", () => {
    expect(() => cscSchema.parse({ ...getAlert("opioids-pregnancy").csc, severityTier: 4 })).toThrow();
  });
});
