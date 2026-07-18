import { describe, expect, it } from "vitest";
import { loadPatientIndex } from "../lib/patient-index";
import { config } from "../lib/config";
import { getAlert } from "../lib/alerts";
import { scanPatients } from "../lib/scan";

describe("scan engine", () => {
  const patients = loadPatientIndex(config.data25Path);
  it("matches opioid pregnancy case and excludes prenatal visits without opioids", () => {
    const scan = scanPatients(getAlert("opioids-pregnancy").csc, patients);
    expect(scan.candidates.map((c) => c.patient.sourceIndex)).toEqual([18]);
    for (const idx of [2, 9, 16]) {
      expect(scan.exclusions.find((e) => e.sourceIndex === idx)?.reasons).toContain("no matching drug exposure");
    }
  });

  it("matches HCTZ label-change candidates by real medication strings", () => {
    const scan = scanPatients(getAlert("hctz-skin-cancer").csc, patients);
    expect(scan.candidates.map((c) => c.patient.sourceIndex).sort((a, b) => a - b)).toEqual([6, 10, 12]);
  });

  it("surfaces naproxen pregnancy near misses as not pregnant", () => {
    const scan = scanPatients(getAlert("nsaids-pregnancy-20wk").csc, patients);
    expect(scan.candidates).toHaveLength(0);
    for (const idx of [8, 19, 24]) expect(scan.exclusions.find((e) => e.sourceIndex === idx)?.nearMiss).toMatch(/not pregnant/);
  });
});
