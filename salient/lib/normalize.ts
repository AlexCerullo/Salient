const SYNONYMS: Record<string, string[]> = {
  hydrocodone: ["hydrocodone", "hydrocodone bitartrate", "vicodin", "norco", "lortab"],
  tramadol: ["tramadol", "tramadol hydrochloride", "ultram"],
  meperidine: ["meperidine", "meperidine hydrochloride", "demerol"],
  naproxen: ["naproxen", "naproxen sodium", "aleve"],
  ibuprofen: ["ibuprofen", "advil", "motrin"],
  hydrochlorothiazide: ["hydrochlorothiazide", "hctz", "hydrodiuril", "microzide"]
};

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalDrugTerms(name: string) {
  const n = normalizeText(name);
  const terms = new Set([n]);
  for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
    if (aliases.some((a) => n.includes(normalizeText(a)))) terms.add(canonical);
  }
  return [...terms];
}

export function hasTerm(haystack: string, needle: string) {
  const h = normalizeText(haystack);
  const terms = canonicalDrugTerms(needle);
  return terms.some((term) => h.includes(normalizeText(term)));
}

export function normalizedIncludes(haystack: string, needle: string) {
  return normalizeText(haystack).includes(normalizeText(needle));
}

export function sameSpan(haystack: string, quote: string) {
  return normalizeText(haystack).includes(normalizeText(quote));
}
