# 02 — PR Import Engine

## Objective

The PR Import Engine converts external pull requests into immutable PR Snapshots.

Its purpose is to make real RAP Portal pull requests usable as stable experimental inputs.

Once a pull request is imported, the platform should never depend on the live GitHub PR state for that experiment. Instead, experiments run against the stored snapshot.

---

## Role in the Platform

```text
GitHub PR / Uploaded Diff
        ↓
PR Import Engine
        ↓
Diff Parser
        ↓
PR Snapshot
        ↓
Experiment Engine
```

The PR Import Engine runs before any review architecture.

It prepares the input data used by Agentless, Hierarchical, and Consensus experiments.

---

## Core Responsibilities

The PR Import Engine is responsible for:

1. Importing pull request metadata.
2. Importing raw unified diffs.
3. Saving raw diff content.
4. Parsing changed files.
5. Extracting changed line ranges.
6. Creating immutable PR Snapshots.
7. Assigning category and complexity.
8. Supporting manual `.diff` uploads.
9. Supporting GitHub PR URL import.
10. Avoiding duplicate snapshots when the same PR/commit is imported again.

---

## Non-Responsibilities

The PR Import Engine is **not** responsible for:

* reviewing code
* calling LLMs
* calculating precision or recall
* storing experiment findings
* deciding whether a PR should merge
* modifying the RAP Portal repository
* posting GitHub review comments

---

## PR Snapshot Definition

A PR Snapshot is an immutable record of a pull request at a specific commit.

```ts
export interface PRSnapshot {
  snapshotId: string;

  source: "github" | "manual" | "synthetic";

  repositoryOwner?: string;
  repositoryName?: string;
  prNumber?: number;
  commitHash?: string;

  title: string;
  description?: string;

  rawDiffS3Key: string;

  changedFiles: ChangedFile[];
  totalChangedLines: number;

  category: PRCategory;
  complexity: PRComplexity;

  importedAt: string;
}
```

---

## Changed File Definition

```ts
export interface ChangedFile {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  changedLineRanges: ChangedLineRange[];
}
```

---

## Changed Line Range Definition

```ts
export interface ChangedLineRange {
  startLine: number;
  endLine: number;
  changeType: "added" | "removed" | "context";
}
```

---

## PR Category

```ts
export type PRCategory =
  | "frontend"
  | "backend"
  | "database"
  | "cross-component"
  | "infrastructure"
  | "documentation"
  | "unknown";
```

Recommended classification rules:

| Category        | Example Files                              |
| --------------- | ------------------------------------------ |
| frontend        | `app/`, `components/`, `.tsx`, `.jsx`, CSS |
| backend         | `api/`, `server/`, routes, controllers     |
| database        | migrations, schema, SQL, ORM models        |
| infrastructure  | SST, Terraform, GitHub Actions, AWS config |
| documentation   | `.md`, docs only                           |
| cross-component | more than one major layer                  |

---

## PR Complexity

```ts
export type PRComplexity = "small" | "medium" | "large";
```

Recommended rules:

| Complexity |  Changed Lines |
| ---------- | -------------: |
| small      | fewer than 100 |
| medium     |        100–500 |
| large      |  more than 500 |

---

## Import Sources

The PR Import Engine supports three sources.

### 1. GitHub PR URL

Example:

```text
https://github.com/org/rap-portal/pull/42
```

The engine extracts:

* owner
* repository name
* PR number

Then retrieves:

* PR title
* PR description
* head commit SHA
* unified diff

---

### 2. Manual `.diff` Upload

Used when GitHub API integration is not available.

The user uploads a raw unified diff file.

Required metadata:

* title
* source repository
* optional commit hash
* category
* complexity

---

### 3. Synthetic PR

Used for controlled experiments.

Synthetic PRs include:

* raw diff
* known ground truth defects
* category
* complexity

Synthetic PR import should reuse the same snapshot structure as real PR import.

---

## Snapshot Idempotency

A snapshot should be uniquely identified by:

```text
repositoryOwner
repositoryName
prNumber
commitHash
```

If the same PR and commit hash are imported again, the platform should return the existing snapshot.

If the same PR has a new commit hash, create a new snapshot.

Example:

```text
rap-portal#42#commit-a
rap-portal#42#commit-b
```

These are two different snapshots.

---

## Main Flow: GitHub Import

```text
1. User submits GitHub PR URL
2. Parse repository owner, repository name, PR number
3. Call GitHub API
4. Fetch PR metadata
5. Fetch PR diff
6. Calculate snapshot idempotency key
7. Check if snapshot already exists
8. If exists, return existing snapshot
9. Save raw diff to S3
10. Parse changed files and line ranges
11. Classify category and complexity
12. Save PR Snapshot
13. Return snapshotId
```

---

## Main Flow: Manual Diff Upload

```text
1. User uploads .diff file
2. User provides title and metadata
3. Save raw diff to S3
4. Parse changed files and line ranges
5. Classify category and complexity
6. Save PR Snapshot
7. Return snapshotId
```

---

## Sequence Diagram

```text
User
  ↓
POST /api/snapshots/import
  ↓
Snapshot API
  ↓
PR Import Service
  ↓
GitHub Provider / Manual Upload
  ↓
S3 Raw Diff Storage
  ↓
Diff Parser
  ↓
Snapshot Repository
  ↓
snapshotId
```

---

## API Contract

### Import GitHub PR

```http
POST /api/snapshots/import/github
```

Request:

```json
{
  "prUrl": "https://github.com/org/rap-portal/pull/42"
}
```

Response:

```json
{
  "snapshotId": "snap_042_abcd",
  "reusedExisting": false
}
```

---

### Upload Manual Diff

```http
POST /api/snapshots/import/manual
```

Request:

```json
{
  "title": "Synthetic missing auth defect",
  "description": "Synthetic PR for controlled evaluation",
  "source": "synthetic",
  "rawDiff": "...",
  "category": "backend",
  "complexity": "small"
}
```

Response:

```json
{
  "snapshotId": "snap_manual_001",
  "reusedExisting": false
}
```

---

## Service Interface

```ts
export interface ImportGithubPRInput {
  prUrl: string;
}

export interface ImportManualDiffInput {
  title: string;
  description?: string;
  source: "manual" | "synthetic";
  rawDiff: string;
  category?: PRCategory;
  complexity?: PRComplexity;
  groundTruth?: GroundTruthDefect[];
}

export interface ImportSnapshotResult {
  snapshotId: string;
  reusedExisting: boolean;
}

export interface IPRImportService {
  importGithubPR(input: ImportGithubPRInput): Promise<ImportSnapshotResult>;
  importManualDiff(input: ImportManualDiffInput): Promise<ImportSnapshotResult>;
}
```

---

## Repository Interaction

The PR Import Engine uses:

```text
SnapshotRepository
RawDiffStorage
GroundTruthRepository
```

Required methods:

```ts
export interface SnapshotRepository {
  findByIdempotencyKey(key: string): Promise<PRSnapshot | null>;
  create(snapshot: PRSnapshot): Promise<void>;
  getById(snapshotId: string): Promise<PRSnapshot | null>;
}
```

```ts
export interface RawDiffStorage {
  saveRawDiff(snapshotId: string, rawDiff: string): Promise<string>;
  getRawDiff(rawDiffS3Key: string): Promise<string>;
}
```

---

## GitHub Provider Interface

```ts
export interface GitHubPRMetadata {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description?: string;
  headCommitSha: string;
}

export interface IGitHubProvider {
  getPRMetadata(owner: string, repo: string, prNumber: number): Promise<GitHubPRMetadata>;
  getPRDiff(owner: string, repo: string, prNumber: number): Promise<string>;
}
```

---

## Classification Logic

The PR Import Engine should classify PRs automatically when possible.

### File-Based Category Detection

Example rules:

```text
.tsx / .jsx / components / app
→ frontend

api / route / controller / service
→ backend

migration / schema / sql / prisma / drizzle
→ database

.github / sst / terraform / cloudformation
→ infrastructure

docs / .md
→ documentation
```

If multiple major categories are present, classify as:

```text
cross-component
```

Manual override should be allowed.

---

## Complexity Logic

Complexity is based on total changed lines:

```ts
function classifyComplexity(totalChangedLines: number): PRComplexity {
  if (totalChangedLines < 100) return "small";
  if (totalChangedLines <= 500) return "medium";
  return "large";
}
```

---

## Validation Rules

A PR Snapshot is valid only if:

* it has a title
* it has a raw diff
* at least one changed file is detected
* snapshot ID is unique
* raw diff is saved successfully
* changed files are parsed successfully

Invalid snapshots should not be saved.

---

## Error Handling

### Invalid GitHub URL

Return:

```json
{
  "error": "Invalid GitHub pull request URL"
}
```

### GitHub API Failure

Possible causes:

* private repository access denied
* rate limit
* PR not found
* network timeout

Mitigation:

* show clear error
* allow manual `.diff` upload fallback

### Invalid Diff

If the uploaded diff cannot be parsed:

* reject import
* show parse error
* do not create snapshot

### Duplicate Snapshot

If the same PR and commit already exist:

* return existing snapshot ID
* do not overwrite existing snapshot

---

## Logging Requirements

Every import log should include:

```text
snapshotId
source
repository
prNumber
commitHash
```

Example:

```json
{
  "level": "info",
  "message": "Imported GitHub PR snapshot",
  "snapshotId": "snap_042_abcd",
  "repository": "org/rap-portal",
  "prNumber": 42,
  "commitHash": "abc123"
}
```

---

## Security Considerations

The GitHub token should be stored in environment variables or AWS Secrets Manager.

Do not log:

* GitHub access tokens
* private repository credentials
* full raw diffs if they may contain secrets

Optional future improvement:

* run secret scanning on imported diffs

---

## Minimum Viable Implementation

The Week 1 minimum implementation should support:

```text
Manual diff upload
↓
Save raw diff
↓
Parse changed files
↓
Create PR Snapshot
↓
Run Agentless experiment
```

GitHub API import can be added after manual import works.

---

## Implementation Order

Recommended order:

1. Define `PRSnapshot` type.
2. Implement manual diff import.
3. Implement raw diff storage.
4. Implement snapshot repository.
5. Implement diff parser integration.
6. Add category classification.
7. Add complexity classification.
8. Add GitHub PR URL import.
9. Add synthetic PR ground truth support.

---

## Design Decisions

### Decision 1 — Snapshot Before Experiment

Experiments must run on stored snapshots, not live GitHub PRs.

Reason:

* reproducibility
* replayability
* stable inputs

### Decision 2 — Manual Upload First

Manual `.diff` upload should be implemented before GitHub integration.

Reason:

* faster Week 1 delivery
* avoids GitHub API complexity
* easier testing

### Decision 3 — Raw Diff Stored Separately

Raw diffs should be stored in S3 or file storage, not directly inside the main database.

Reason:

* diffs can be large
* keeps database small
* supports raw artifact export

### Decision 4 — Commit Hash Creates New Snapshot

A new commit on the same PR creates a new snapshot.

Reason:

* the code changed
* experiments must remain tied to exact input

---

## Future Improvements

Future versions may support:

* GitHub webhook import
* automatic PR polling
* secret scanning
* repository cloning
* file-level source retrieval
* branch comparison
* automatic commit-to-fix linkage
* direct GitHub review comment import

---

## Summary

The PR Import Engine is responsible for transforming unstable external pull requests into stable, immutable PR Snapshots.

This module is critical because the quality of every experiment depends on the stability and accuracy of its input data.
