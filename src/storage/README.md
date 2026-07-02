# Storage Layer

Two concerns live here:

- **Raw-diff storage** (RFC-03.5) — `RawDiffStorage` for large unified-diff artifacts.
- **Experiment-result storage** (RFC-06) — the **Storage Engine** that preserves
  raw results, validated results, and findings after execution.

> Spec: `docs/implementaion/06-storage-engine.md`

This RFC is **in-memory only** — no DynamoDB or S3. Everything is behind
repository ports so infrastructure can be swapped later.

## Storage Engine (RFC-06)

Persists experiment artifacts so the platform can support replay, debugging,
evaluation, and reproducibility. It stores:

- **raw result** — exactly as the architecture returned it (never overwritten)
- **validated result** — only after validation succeeds
- **findings** — separately, so they can be queried/exported/evaluated
- validation metadata (with the validated result)

```
Experiment Engine → StorageEngine → RawResult/ValidatedResult/Finding repositories → in-memory (DynamoDB/S3 later)
```

### Files

```
src/storage/
├── storage-engine.ts                 # IStorageEngine + StorageEngine
├── stored-models.ts                  # StoredRawReviewResult / StoredValidatedReviewResult / StoredReviewFinding / StoredExperimentResult
├── raw-result-repository.ts          # RawResultRepository (port)
├── validated-result-repository.ts    # ValidatedResultRepository (port)
├── finding-repository.ts             # FindingRepository (port)
├── storage-errors.ts                 # StorageError + Write/Read/DuplicateArtifact
├── raw-diff-storage.ts               # RawDiffStorage (RFC-03.5)
├── index.ts
└── in-memory/
    ├── in-memory-raw-result-repository.ts
    ├── in-memory-validated-result-repository.ts
    ├── in-memory-finding-repository.ts
    └── in-memory-raw-diff-storage.ts
```

### Interface

```ts
interface IStorageEngine {
  storeRawResult(input: { experimentId: string; rawResult: RawReviewResult }): Promise<void>;
  storeValidatedResult(input: { experimentId: string; validatedResult: ValidatedReviewResult }): Promise<void>;
  getExperimentResult(experimentId: string): Promise<StoredExperimentResult | null>;
}
```

`storeValidatedResult` persists the validated result **and** its findings
(separately). `getExperimentResult` composes raw + validated + findings, or
returns `null` when nothing is stored.

### Rules enforced

1. **Raw preserved exactly** — stored immediately after architecture execution.
2. **Validated stored only after validation succeeds** — the engine calls
   `storeValidatedResult` only on the success path.
3. **Findings stored separately**, stamped with `experimentId` + `architecture`.
4. **Immutable** — a second write for the same experiment throws
   `DuplicateArtifactError`.
5. **No caller mutation** — repositories deep-clone (`structuredClone`) on write
   and read, so stored artifacts and caller objects never affect each other.
6. **Infrastructure-agnostic** — depends only on repository ports.

### Experiment Engine integration

```
architecture → RawReviewResult
  → storage.storeRawResult                (preserve raw)
  → validation                            (throws → experiment failed, raw kept)
  → storage.storeValidatedResult          (validated + findings)
  → evaluate → completed
```

On validation failure the raw result remains stored; no validated result is
written; the experiment is marked `failed`. Review architectures never touch
storage — only the engine does.

## Errors

`StorageError` (base) → `StorageWriteError`, `StorageReadError`,
`DuplicateArtifactError`.

## Known limitation

Retrying an experiment that failed **after** its raw result was stored (i.e. a
validation failure, not an architecture failure) would hit
`DuplicateArtifactError` on re-store, since artifacts are immutable and attempts
are not yet versioned. Artifact versioning is listed as a future improvement.

## Tests

- `tests/unit/storage-engine.test.ts` — store/retrieve, findings-separate,
  duplicates, immutability/no-mutation, null.
- `tests/unit/storage-integration.test.ts` — full pipeline
  (`sample.diff → import → engine → Agentless → validation → storage`) and
  validation-failure-preserves-raw-only.
