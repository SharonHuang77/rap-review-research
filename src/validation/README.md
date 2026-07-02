# Validation & Result Processing Engine (RFC-05)

The boundary between **raw LLM output** and the **experimental dataset**. It
converts a `RawReviewResult` into a schema-valid `ValidatedReviewResult` by
cleaning, extracting, parsing, validating (Zod), and normalizing.

> Spec: `docs/implementaion/05-validation-engine.md`

Every review architecture's output passes through here before it can be stored
or evaluated, so all architectures are compared on identical, standardized data.

## Pipeline

```
RawReviewResult.rawOutput
  → ResponseCleaner   (strip ```fences```, trim)
  → JSONExtractor     (first balanced JSON object, ignore commentary)
  → JSON.parse
  → SchemaValidator   (Zod; reject missing/invalid required fields)
  → ResultNormalizer  (severity/category casing, clamp confidence, assign id)
  → ValidatedReviewResult (+ ValidationMetadata)
```

If `rawOutput` is already a structured object (some architectures/tests), the
clean/extract/parse steps are skipped and it is validated directly.

## Files

```
src/validation/
├── validation-engine.ts     # orchestrates the pipeline; implements IOutputValidator
├── response-cleaner.ts      # ResponseCleaner
├── json-extractor.ts        # JSONExtractor (string/escape-aware brace matching)
├── schema-validator.ts      # SchemaValidator (Zod)
├── result-normalizer.ts     # ResultNormalizer
├── validation-errors.ts     # ValidationError + JSON/Schema/Normalization errors
├── index.ts
└── schemas/
    ├── review-finding-schema.ts   # reviewFindingInputSchema (Zod)
    └── review-result-schema.ts    # reviewResultInputSchema + SCHEMA_VERSION
```

## What it may repair vs. must not invent

**Repairs** (recorded in `validation.repairActions`): Markdown fences, leading/
trailing commentary, whitespace, severity/category casing, out-of-range
confidence (clamped to `[0,1]`), and assigning a deterministic finding `id`
when absent.

**Never invents**: findings, files, line numbers, descriptions, or
recommendations. If a required field is missing, validation **fails** — it does
not fabricate data.

## Types

- `ReviewFinding` (`src/models/finding.ts`) — canonical finding, now with `id`.
- `ValidatedReviewResult` (`src/models/review-result.ts`) — `summary`, `findings`,
  `validation`, plus execution metrics carried through from the raw result.
- `ValidationMetadata` (`src/models/validation-metadata.ts`) — `schemaVersion`,
  `promptVersion`, `validationPassed`, `repaired`, `repairActions`.

## Errors (typed)

`ValidationError` (base) → `JSONExtractionError`, `SchemaValidationError`,
`NormalizationError`. The Experiment Engine decides how failures are handled (it
marks the experiment `failed`).

## Purity

The engine is **pure and deterministic**: no repositories, databases, Bedrock,
OpenAI, LLM repair calls, `Date.now`, or randomness. Given the same input it
always produces the same output — safe to replay over historical raw results.

## Usage

```ts
import { ValidationEngine } from "./src/validation/index.ts";

const engine = new ValidationEngine();
const validated = await engine.validate(rawReviewResult, { promptVersion: "v1" });
```

Wired as the Experiment Engine's validator by `createExperimentService` (it
replaced the RFC-01 passthrough placeholder).

## Tests

- `tests/unit/validation-cleaner-extractor.test.ts`
- `tests/unit/validation-engine.test.ts` (valid/invalid/missing/normalize/clamp/metadata)
- `tests/unit/validation-agentless-integration.test.ts` (Agentless raw → validated)
