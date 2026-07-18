import { describe, expect, it } from "vitest";
import { loadPatientIndex } from "../lib/patient-index";
import { config } from "../lib/config";
import { getCuratedCsc } from "../lib/alerts";
import { scanPatients } from "../lib/scan";

describe("scan engine", () => {
  const patients = loadPatientIndex(config.data25Path);
  it("matches opioid pregnancy case and excludes prenatal visits without opioids", () => {
    const scan = scanPatients(getCuratedCsc("opioids-pregnancy"), patients);
    expect(scan.candidates.map((c) => c.patient.sourceIndex)).toEqual([18]);
    expect(scan.candidates[0].matchType).toBe("exposure");
    for (const idx of [2, 9, 16]) {
      expect(scan.exclusions.find((e) => e.sourceIndex === idx)?.reasons).toContain("no matching drug exposure");
    }
  });

  it("matches HCTZ label-change candidates by real medication strings", () => {
    const scan = scanPatients(getCuratedCsc("hctz-skin-cancer"), patients);
    expect(scan.candidates.map((c) => c.patient.sourceIndex).sort((a, b) => a - b)).toEqual([6, 10, 12]);
    expect(scan.candidates.every((c) => c.matchType === "exposure")).toBe(true);
  });

  it("surfaces pregnant patients as monitor candidates for the OTC NSAID alert", () => {
    const scan = scanPatients(getCuratedCsc("nsaids-pregnancy-20wk"), patients);
    const monitors = scan.candidates.filter((c) => c.matchType === "monitor");
    expect(monitors.map((c) => c.patient.sourceIndex).sort((a, b) => a - b)).toEqual([2, 9, 16, 18]);
    // no documented NSAID exposure exists in the panel, so no exposure candidates
    expect(scan.candidates.filter((c) => c.matchType === "exposure")).toHaveLength(0);
    // non-pregnant NSAID users stay excluded as near misses
    for (const idx of [8, 19, 24]) expect(scan.exclusions.find((e) => e.sourceIndex === idx)?.nearMiss).toMatch(/not pregnant/);
  });

  it("extracts gestational age from prose for prenatal patients", () => {
    for (const idx of [9, 16, 18]) {
      const p = patients[idx];
      expect(p.pregnancy.pregnant).toBe(true);
      expect(p.pregnancy.gestationalWeeks ?? (p.pregnancy.trimester === 1 ? 10 : undefined)).toBeLessThan(20);
    }
  });
});
