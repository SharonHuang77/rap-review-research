# PR Import Engine (RFC-02)

The PR Import Engine converts external pull requests into **immutable PR
Snapshots** — the stable experimental inputs every review architecture runs
against. This RFC implements **manual `.diff` upload only**.

It does **not** call GitHub, talk to S3/DynamoDB, call an LLM, or review code.

> Spec: `docs/implementaion/02-pr-import-engine.md`
> Guidelines: `docs/implementaion/00-development-guidelines.md`

---

## Scope of this RFC

Implemented:

- `PRSnapshot` / `ChangedFile` / `ChangedLineRange` models (`src/models/snapshot.ts`)
- `SnapshotRepository` interface + in-memory impl (`src/repositories/`)
- `RawDiffStorage` interface + in-memory impl (`src/storage/`)
- Basic unified-diff parser (`src/engines/pr-import/diff-parser.ts`)
- Category + complexity classification (`src/engines/pr-import/classification.ts`)
- `PRImportEngine` + `PRImportService` + factory (`src/engines/pr-import/`, `src/services/snapshot/`)
- Unit tests (`tests/unit/`) and a sample `.diff` (`tests/fixtures/sample.diff`)

Explicitly **out of scope** (future RFCs):

- GitHub API import (`importGithubPR`) and the GitHub provider
- S3 / DynamoDB adapters
- Synthetic-PR ground truth (`GroundTruthRepository`, step 9 of the spec order)
- LLM calls, dashboard, validation engine, hierarchical/consensus

---

## Folder structure (RFC-02 additions)

```
src/
├── models/snapshot.ts              # PRSnapshot, ChangedFile, ChangedLineRange,
│                                   #   PRCategory/PRComplexity/source, import DTOs
├── storage/
│   ├── raw-diff-storage.ts         # RawDiffStorage (interface)
│   ├── in-memory/in-memory-raw-diff-storage.ts
│   └── index.ts
├── engines/pr-import/
│   ├── diff-parser.ts              # IDiffParser + UnifiedDiffParser
│   ├── classification.ts           # classifyFile / classifyCategory / classifyComplexity
│   ├── pr-import-engine.ts         # PRImportEngine + IPRImportEngine
│   └── index.ts
└── services/snapshot/
    ├── pr-import-service.ts         # PRImportService + IPRImportService
    ├── create-pr-import-service.ts  # composition root / factory
    └── index.ts
```

## Public interfaces

```ts
interface IPRImportService {
  importManualDiff(input: ImportManualDiffInput): Promise<ImportSnapshotResult>;
}
interface IPRImportEngine {
  importManualDiff(input: ImportManualDiffInput): Promise<ImportSnapshotResult>;
}
interface IDiffParser { parse(rawDiff: string): ParsedDiff; }

interface SnapshotRepository {
  findByIdempotencyKey(key: string): Promise<PRSnapshot | null>;
  create(snapshot: PRSnapshot): Promise<void>;
  getById(snapshotId: string): Promise<PRSnapshot | null>;
}
interface RawDiffStorage {
  saveRawDiff(snapshotId: string, rawDiff: string): Promise<string>;
  getRawDiff(key: string): Promise<string>;
}
```

## Import flow (manual)

```
validate (title + raw diff)
  → parse changed files & line ranges
  → reject if zero files
  → allocate snapshotId
  → store raw diff (returns key)
  → classify category + complexity (unless overridden)
  → create immutable snapshot
  → { snapshotId, reusedExisting: false }
```

## Classification

- **Category** — each file is mapped to one area (`database`, `infrastructure`,
  `documentation`, `backend`, `frontend`, else `unknown`); one area → that area,
  more than one → `cross-component`, none → `unknown`. A manual override wins.
- **Complexity** — by total changed lines: `< 100` small, `100–500` medium,
  `> 500` large.

## Usage

```ts
import { createPRImportService } from "./src/services/snapshot/index.ts";

const { service, snapshots } = createPRImportService();
const { snapshotId } = await service.importManualDiff({
  title: "Add rate limiting",
  source: "manual",          // or "synthetic"
  rawDiff: "<unified diff>",
});
const snapshot = await snapshots.getById(snapshotId);
```

Run the demo: `npm run demo:import`.

---

## Implementation decisions

1. **Unified the `PRSnapshot` model with RFC-01.** RFC-01 had defined an interim
   `PRSnapshot` / `SnapshotRepository` so the Experiment Engine had something to
   read. RFC-02 is the authoritative owner, so the model was replaced with the
   richer spec shape (`source`, `rawDiffS3Key`, `category`, `complexity`,
   `totalChangedLines`; richer `ChangedFile` / `ChangedLineRange`) and the
   repository moved to the spec interface (`findByIdempotencyKey` / `create` /
   `getById`). The Experiment Engine's one call site changed from `findById` to
   `getById`; fixtures/demo were updated. There is now a single snapshot entity.

2. **Raw diff stored separately.** Per the spec, the raw diff lives in
   `RawDiffStorage` (in-memory here, S3 later) and the snapshot holds only the
   key, keeping the snapshot record small.

3. **Manual imports have no idempotency key.** Snapshot dedup is keyed by
   `owner#repo#prNumber#commitHash`. Manual uploads lack these, so
   `buildSnapshotIdempotencyKey` returns `null` and they never collide — each
   manual import is a distinct snapshot. (Idempotency matters for GitHub import,
   a future RFC; the repository already supports it.)

4. **Ground truth deferred.** The spec's `ImportManualDiffInput.groundTruth` and
   `GroundTruthRepository` are step 9 ("synthetic PR ground truth") and are out
   of scope here. Rather than accept-and-drop the field, it is omitted from the
   input until that RFC, so no data is silently discarded.

5. **GitHub import deferred.** `IPRImportService` exposes only `importManualDiff`
   for now; `importGithubPR` and the GitHub provider arrive with the GitHub RFC.
   No stub/TODO is left behind.

6. **Typed errors.** `ImportError` (missing title/diff) and `DiffParseError`
   (no changed files) extend the shared `DomainError` hierarchy.

7. **Tooling unchanged.** Native TypeScript on `node:test`, string-literal
   unions, no parameter properties, `erasableSyntaxOnly`. See the
   [RFC-01 README](../experiment/README.md#build--test-workflow).
