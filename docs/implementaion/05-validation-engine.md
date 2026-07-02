# 05 — Validation & Result Processing Engine

**Module:** Validation & Result Processing Engine

**Status:** Ready for Implementation

**Dependencies:**

* RFC-01 Experiment Engine
* RFC-03 Review Architecture Framework
* RFC-03.5 Shared LLM Architecture
* RFC-04 Agentless Review Architecture

---

# 1. Purpose

The Validation & Result Processing Engine converts raw LLM responses into validated, normalized, and reproducible research data.

The engine is the boundary between **LLM output** and the **experimental dataset**.

Every review architecture (Agentless, Hierarchical, Consensus) must pass through this engine before results can be stored or evaluated.

---

# 2. Research Motivation

Large Language Models frequently produce:

* Markdown code fences
* Extra explanatory text
* Minor JSON formatting inconsistencies
* Inconsistent field values
* Different capitalization
* Missing optional fields

These inconsistencies must not affect the experimental results.

The Validation Engine ensures every experiment produces standardized output regardless of the review architecture or LLM provider.

---

# 3. Responsibilities

The Validation Engine is responsible for:

* cleaning LLM output
* extracting JSON
* schema validation
* normalization
* generating validation metadata
* producing `ValidatedReviewResult`

It is **not** responsible for:

* running LLMs
* storing data
* computing evaluation metrics
* replay orchestration

---

# 4. Architecture

```text
RawReviewResult
        │
        ▼
ResponseCleaner
        │
        ▼
JSONExtractor
        │
        ▼
SchemaValidator
        │
        ▼
ResultNormalizer
        │
        ▼
ValidationEngine
        │
        ▼
ValidatedReviewResult
```

Each stage performs one responsibility.

---

# 5. Execution Workflow

```text
RawReviewResult
        │
Strip Markdown fences
        │
Extract JSON
        │
Parse JSON
        │
Validate Schema
        │
Normalize Values
        │
Generate Validation Metadata
        │
Return ValidatedReviewResult
```

---

# 6. Component Design

```text
src/

validation/

    ValidationEngine.ts

    ResponseCleaner.ts

    JSONExtractor.ts

    SchemaValidator.ts

    ResultNormalizer.ts

    ValidationMetadata.ts

    schemas/

        ReviewFindingSchema.ts

        ReviewResultSchema.ts
```

---

# 7. ResponseCleaner

Responsibilities:

* remove Markdown fences
* trim whitespace
* remove surrounding commentary
* preserve JSON

Example

Input:

````text
Sure!

```json
{
 ...
}
```
````

Output:

```json
{
 ...
}
```

---

# 8. JSONExtractor

Responsibilities:

Extract the first valid JSON object from text.

Input:

```text
Here is the review.

{
...
}

Thanks.
```

Output:

```json
{
...
}
```

---

# 9. SchemaValidator

Use Zod.

Validate:

* ReviewFinding
* ReviewResult

Reject invalid structures.

No automatic field invention.

---

# 10. ResultNormalizer

Normalize values.

Examples:

Severity

```text
HIGH
High
high
```

↓

```text
high
```

Category

```text
Security
SECURITY
security
```

↓

```text
security
```

Confidence

Clamp to

```text
0.0 - 1.0
```

Normalize empty arrays.

Normalize missing optional fields.

---

# 11. ReviewFinding

```ts
export interface ReviewFinding {

    id: string;

    title: string;

    severity:
        | "low"
        | "medium"
        | "high"
        | "critical";

    category: string;

    file: string;

    line: number;

    description: string;

    recommendation: string;

    confidence: number;

}
```

This becomes the canonical finding model.

---

# 12. ValidatedReviewResult

```ts
export interface ValidatedReviewResult {

    architecture: ReviewArchitecture;

    summary: string;

    findings: ReviewFinding[];

    validation: ValidationMetadata;

    latencyMs: number;

    inputTokens: number;

    outputTokens: number;

    estimatedCostUsd: number;

    llmCalls: number;

    messageCount: number;

}
```

Unlike RawReviewResult, this object is guaranteed to satisfy the project schema.

---

# 13. ValidationMetadata

```ts
export interface ValidationMetadata {

    schemaVersion: string;

    promptVersion: string;

    validationPassed: boolean;

    repaired: boolean;

    repairActions: string[];

}
```

This metadata becomes part of the experiment record.

---

# 14. Validation Rules

The engine may repair:

* Markdown fences
* leading text
* trailing text
* capitalization
* whitespace

The engine must **not** invent:

* findings
* files
* line numbers
* recommendations

If required data is missing, validation fails.

---

# 15. Error Handling

Expose typed errors:

```text
ValidationError

JSONExtractionError

SchemaValidationError

NormalizationError
```

The Experiment Engine decides how failures are handled.

---

# 16. Storage Strategy

Both objects should be preserved.

```text
RawReviewResult

↓

ValidatedReviewResult
```

Never overwrite the raw result.

Future validation improvements should be able to replay historical results.

---

# 17. Logging

Record:

* experimentId
* schemaVersion
* promptVersion
* repaired
* validationPassed
* repairActions

Do not log raw prompts.

---

# 18. Testing

Unit tests:

* Markdown removal
* JSON extraction
* schema validation
* normalization
* confidence clamping
* invalid JSON
* missing fields

Integration tests:

Agentless

↓

Validation

↓

ValidatedReviewResult

---

# 19. Acceptance Criteria

* [ ] Markdown fences removed
* [ ] JSON extracted
* [ ] JSON parsed
* [ ] Zod validation passes
* [ ] Invalid JSON rejected
* [ ] Severity normalized
* [ ] Category normalized
* [ ] Confidence normalized
* [ ] ValidationMetadata generated
* [ ] ValidatedReviewResult returned
* [ ] Unit tests pass
* [ ] Integration tests pass

---

# 20. AI Implementation Checklist

Before submitting:

* [ ] Read Development Guidelines
* [ ] No repository access
* [ ] No provider access
* [ ] No architecture-specific logic
* [ ] No evaluation logic
* [ ] No TODO placeholders
* [ ] Tests included
* [ ] Documentation updated

---

# 21. Out of Scope

Do not implement:

* Storage Engine
* Evaluation Engine
* Dashboard
* Replay
* Hierarchical
* Consensus

This RFC ends with the creation of a validated result.

---

# 22. Future Improvements

Future versions may support:

* schema evolution
* automatic JSON repair using an LLM
* semantic validation
* duplicate finding detection
* confidence calibration
* schema migration

These improvements should preserve backward compatibility with historical experiments.

---

# Summary

The Validation & Result Processing Engine transforms unreliable LLM output into standardized, schema-valid experimental data.

It establishes the canonical review format used throughout the remainder of the research platform and ensures that all architectures are evaluated on a consistent and reproducible basis.
