# AI Synthetic Ambient FHIR Encounters

A fully synthetic dataset containing **270 encounters from 270 synthetic
patients**. Each record pairs a speaker-labeled ambient conversation with a
SOAP-style note, an after-visit summary, summarized chart background, and
structured FHIR R4 encounter context. No real patient information is included.

## Dataset summary

- 270 encounters from 270 unique synthetic patients
- Encounter dates from 2024-01-08 through 2026-07-18
- 122,307 transcript words and 76,463 note words
- 1,396 encounter-linked FHIR resources
- 270 unique visit titles and no exact transcript or AVS duplicates

The latest 100-record expansion focuses on rare conditions: 34
genetic/metabolic/endocrine, 33 neurologic/hematologic/oncologic, and 33
autoimmune/cardiopulmonary/GI/dermatologic cases. It contains 100 unique primary
diagnosis labels. Rare-disease naming and clinical framing were informed by
GARD and Orphanet resources, but the records have not been clinically reviewed.

## Files

| File | What it is |
|------|------------|
| `ai-synthetic-ambient-fhir-270.jsonl` | Canonical dataset — one JSON record per line |
| `ai-synthetic-ambient-fhir-270.json` | The same 270 records as a JSON array |
| `schema.json` | JSON Schema for one record |
| `summary.json` | Compact encounter index and statistics |
| `index.html` | Offline encounter browser with embedded records |

## Record structure

Every record contains `id`, `metadata`, `patient_context`, `encounter_fhir`,
`transcript`, `note`, `after_visit_summary`, and
`after_visit_summary_provenance`. IDs use `<patient_id>::<encounter_id>`.

## Quickstart

```python
import json

with open("ai-synthetic-ambient-fhir-270.jsonl", encoding="utf-8") as f:
    records = [json.loads(line) for line in f]

print(len(records))
print(records[0]["metadata"]["visit_title"])
```

## Data notes

- Everything is synthetic and intended for prototyping, demonstrations, and
  hackathon work—not medical advice or a clinically validated benchmark.
- After-visit summaries have not been clinically reviewed and are not ground truth.
- Resources are shaped like FHIR R4 but have not been certified by an official
  FHIR validator.
