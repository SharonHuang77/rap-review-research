# 06 — Storage Engine

**Module:** Storage Engine
**Status:** Ready for Implementation
**Dependencies:** RFC-01 Experiment Engine, RFC-02 PR Import Engine, RFC-05 Validation Engine

---

## 1. Purpose

The Storage Engine persists experiment artifacts produced by the platform.

Its main purpose is to ensure that raw LLM outputs, validated results, findings, and experiment metadata are not lost after execution.

The Storage Engine enables:

* replay
* debugging
* later evaluation
* CSV export
* research reproducibility

---

## 2. Research Motivation

The platform must preserve both:

```text
RawReviewResult
ValidatedReviewResult
```

Raw outputs are important because future validation logic may improve.

Validated outputs are important because they become the trusted research dataset.

The system must never overwrite raw experiment artifacts.

---

## 3. Responsibilities

The Storage Engine is responsible for storing:

* raw review results
* validated review results
* review findings
* validation metadata
* experiment completion metadata

It is not responsible for:

* importing PRs
* running LLMs
* validating JSON
* computing metrics
* rendering dashboard UI
* executing review architectures

---

## 4. Architecture

```text
Experiment Engine
        ↓
Validation Engine
        ↓
Storage Engine
        ↓
Repositories
        ↓
In-Memory Storage / Future DynamoDB + S3
```

For this RFC, implement **in-memory storage first**.

Do not implement DynamoDB or S3 yet.

---

## 5. Storage Principles

The Storage Engine must follow these rules:

1. Store raw results exactly as received.
2. Store validated results only after validation succeeds.
3. Store findings separately from the parent result.
4. Never overwrite historical experiment artifacts.
5. Access storage only through repository interfaces.
6. Keep infrastructure replaceable.

---

## 6. Stored Artifacts

### Raw Review Result

Stored immediately after the review architecture returns.

### Validated Review Result

Stored only after validation succeeds.

### Findings

Stored individually so they can later be queried, exported, and evaluated.

### Validation Metadata

Stored with the validated result.

---

## 7. Data Flow

```text
RawReviewResult
        ↓
Store raw result
        ↓
Validation Engine
        ↓
ValidatedReviewResult
        ↓
Store validated result
        ↓
Store findings
        ↓
Mark experiment completed
```

If validation fails:

```text
RawReviewResult
        ↓
Store raw result
        ↓
Validation fails
        ↓
Do not store validated result
        ↓
Mark experiment failed
```

---

## 8. Repository Interfaces

### RawResultRepository

```ts
export interface RawResultRepository {
  save(rawResult: StoredRawReviewResult): Promise<void>;
  getByExperimentId(experimentId: string): Promise<StoredRawReviewResult | null>;
}
```

### ValidatedResultRepository

```ts
export interface ValidatedResultRepository {
  save(result: StoredValidatedReviewResult): Promise<void>;
  getByExperimentId(experimentId: string): Promise<StoredValidatedReviewResult | null>;
}
```

### FindingRepository

```ts
export interface FindingRepository {
  saveMany(findings: StoredReviewFinding[]): Promise<void>;
  getByExperimentId(experimentId: string): Promise<StoredReviewFinding[]>;
}
```

---

## 9. Stored Raw Review Result

```ts
export interface StoredRawReviewResult {
  experimentId: string;
  architecture: ReviewArchitecture;
  rawOutput: unknown;
  summary: string;
  findings: unknown;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  llmCalls: number;
  messageCount: number;
  storedAt: string;
}
```

---

## 10. Stored Validated Review Result

```ts
export interface StoredValidatedReviewResult {
  experimentId: string;
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
  storedAt: string;
}
```

---

## 11. Stored Review Finding

```ts
export interface StoredReviewFinding extends ReviewFinding {
  experimentId: string;
  architecture: ReviewArchitecture;
  storedAt: string;
}
```

---

## 12. Storage Service

Provide a service that coordinates repository writes.

```ts
export interface StoreExperimentResultInput {
  experimentId: string;
  rawResult: RawReviewResult;
  validatedResult?: ValidatedReviewResult;
}

export interface IStorageEngine {
  storeRawResult(input: {
    experimentId: string;
    rawResult: RawReviewResult;
  }): Promise<void>;

  storeValidatedResult(input: {
    experimentId: string;
    validatedResult: ValidatedReviewResult;
  }): Promise<void>;

  getExperimentResult(experimentId: string): Promise<StoredExperimentResult | null>;
}
```

---

## 13. Stored Experiment Result

```ts
export interface StoredExperimentResult {
  experimentId: string;
  rawResult: StoredRawReviewResult | null;
  validatedResult: StoredValidatedReviewResult | null;
  findings: StoredReviewFinding[];
}
```

This is the object later consumed by Evaluation and Dashboard modules.

---

## 14. In-Memory Implementation

For RFC-06, implement only in-memory repositories.

Suggested folder:

```text
src/storage/
  storage-engine.ts
  raw-result-repository.ts
  validated-result-repository.ts
  finding-repository.ts
  in-memory/
    in-memory-raw-result-repository.ts
    in-memory-validated-result-repository.ts
    in-memory-finding-repository.ts
  index.ts
  README.md
```

---

## 15. Experiment Engine Integration

Update the Experiment Engine so that:

1. Raw result is stored immediately after architecture execution.
2. Validated result is stored after validation succeeds.
3. Findings are stored separately.
4. If validation fails, raw result is still preserved.
5. Experiment completion status reflects validation outcome.

Do not allow review architectures to access storage directly.

---

## 16. Error Handling

Expose typed storage errors:

```text
StorageError
StorageWriteError
StorageReadError
DuplicateArtifactError
```

Storage failure should fail the experiment unless the failure is explicitly recoverable.

---

## 17. Immutability Rules

For the in-memory implementation:

* saving the same raw result twice should fail unless explicitly allowed
* saving the same validated result twice should fail unless explicitly allowed
* findings should not be overwritten
* historical artifacts should remain available

---

## 18. Testing Requirements

Unit tests should verify:

* raw result is stored
* validated result is stored
* findings are stored separately
* stored result can be retrieved by experiment ID
* invalid validation does not store validated result
* duplicate artifact writes fail or are rejected
* storage engine does not mutate input objects

Integration tests should verify:

```text
sample.diff
  ↓
PR Import
  ↓
Experiment Engine
  ↓
Agentless
  ↓
Validation
  ↓
Storage
  ↓
StoredExperimentResult
```

---

## 19. Acceptance Criteria

* [ ] Raw result repository implemented
* [ ] Validated result repository implemented
* [ ] Finding repository implemented
* [ ] In-memory implementations added
* [ ] Storage Engine added
* [ ] Raw output preserved exactly
* [ ] Validated result stored only after successful validation
* [ ] Findings stored separately
* [ ] Experiment Engine integrated with Storage Engine
* [ ] Unit tests pass
* [ ] End-to-end storage integration test passes
* [ ] `npm run check` passes

---

## 20. AI Implementation Checklist

Before submitting:

* [ ] Read `00-development-guidelines.md`
* [ ] Read `05-validation-engine.md`
* [ ] No storage access inside review architectures
* [ ] No DynamoDB yet
* [ ] No S3 yet
* [ ] No dashboard logic
* [ ] No evaluation logic
* [ ] No TODO placeholders
* [ ] Tests included
* [ ] README added or updated

---

## 21. Out of Scope

Do not implement:

* DynamoDB
* S3
* CSV export
* dashboard
* evaluation metrics
* replay UI
* Hierarchical
* Consensus
* AWS deployment

---

## 22. Future Improvements

Future RFCs may add:

* DynamoDB repositories
* S3 raw artifact storage
* export service
* replay query support
* experiment comparison views
* archival strategy
* artifact versioning

---

## Summary

The Storage Engine preserves experiment artifacts so the platform can support replay, debugging, evaluation, and research reproducibility.

RFC-06 should remain simple and in-memory first. Infrastructure-specific persistence can be added later.
