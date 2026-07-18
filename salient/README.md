# Salient

Salient is a hackathon prototype for event-driven drug-safety surveillance over synthetic FHIR plus ambient transcripts.

## Quickstart

```bash
cd salient
npm install
npm run dev
```

Open `http://localhost:3000`, choose an alert, and run the pipeline. The server loads the repo-root `.env` and expects `CLAUDE_API_KEY`; `SALIENT_MODEL` and `SALIENT_EFFORT` default to `claude-fable-5` and `medium`.

Useful checks:

```bash
npm test
npm run build
npm run eval
npm run run:demo -- opioids-pregnancy
```

## Architecture

```text
Watch curated FDA excerpts
  -> Comprehend: Claude -> CSC JSON, Zod validated, disk cached
  -> Scan: deterministic TypeScript over 25 synthetic encounters
  -> Adjudicate: Claude candidate review with required citations
  -> Verify: FHIR id and transcript quote checks
  -> Route: prescriber digest + JSON audit decisions
```

Runtime patient data is only `synthetic-ambient-fhir-25/synthetic-ambient-fhir-25.json`. `AI_synthetic_data/` is used only by `npm run eval`.

## Attribution

Built today: Next.js app, pipeline engine, deterministic scan, citation verification, API routes, UI, tests, and eval harness.

Used: public FDA safety communication/labeling concepts and URLs, the synthetic Abridge ambient FHIR dataset supplied for the event, the AI synthetic 270-encounter test set for eval only, and Anthropic Claude API calls. All data in this repository is synthetic.
