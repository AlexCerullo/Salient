import { z } from "zod";

export const cscSchema = z.object({
  id: z.string(),
  alertId: z.string(),
  title: z.string(),
  source: z.object({
    kind: z.enum(["boxed_warning", "safety_communication", "label_change", "shortage"]),
    url: z.string(),
    datePublished: z.string()
  }),
  severityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  drugs: z.object({
    names: z.array(z.string()).default([]),
    rxnormCodes: z.array(z.string()).optional()
  }),
  population: z.object({
    minAgeYears: z.number().optional(),
    maxAgeYears: z.number().optional(),
    sex: z.enum(["male", "female"]).optional(),
    pregnancy: z.boolean().optional(),
    minGestationalWeeks: z.number().optional(),
    requiredConditions: z.array(z.string()).optional(),
    excludedConditions: z.array(z.string()).optional()
  }).default({}),
  labCriteria: z.array(z.object({
    loinc: z.string().optional(),
    nameContains: z.string(),
    op: z.enum(["<", ">", "<=", ">="]),
    value: z.number(),
    unit: z.string().optional(),
    meaning: z.string()
  })).optional(),
  interactionPairs: z.array(z.object({ a: z.array(z.string()), b: z.array(z.string()) })).optional(),
  requiredMonitoring: z.array(z.string()).optional(),
  recommendedActionTemplate: z.string(),
  rationale: z.string()
});

export type CSC = z.infer<typeof cscSchema>;
