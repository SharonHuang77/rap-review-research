/**
 * Where a snapshot's pull request originated.
 */
export type PRSource = "github" | "manual" | "synthetic";

/**
 * Sources permitted for a manual diff upload (RFC-02 manual import path).
 */
export type ManualDiffSource = "manual" | "synthetic";

/**
 * High-level implementation area of a pull request, used to reduce dataset bias.
 */
export type PRCategory =
  | "frontend"
  | "backend"
  | "database"
  | "cross-component"
  | "infrastructure"
  | "documentation"
  | "unknown";

/**
 * Coarse size bucket of a pull request, derived from total changed lines.
 */
export type PRComplexity = "small" | "medium" | "large";

/**
 * How a file was affected by a pull request.
 */
export type FileChangeType = "added" | "modified" | "deleted" | "renamed";

/**
 * The kind of change a line range represents within a diff hunk.
 */
export type LineChangeType = "added" | "removed" | "context";

/**
 * A contiguous range of changed lines within a single file.
 *
 * Added/context ranges are expressed in new-file line numbers; removed ranges
 * in old-file line numbers.
 */
export interface ChangedLineRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly changeType: LineChangeType;
}

/**
 * A single file modified by a pull request.
 */
export interface ChangedFile {
  readonly path: string;
  readonly changeType: FileChangeType;
  readonly additions: number;
  readonly deletions: number;
  readonly changedLineRanges: ChangedLineRange[];
}

/**
 * Immutable representation of a pull request imported into the platform.
 *
 * A snapshot guarantees that every experiment (and every replay) operates on
 * identical input. The raw unified diff is stored separately (large artifact);
 * the snapshot holds only the storage key (`rawDiffS3Key`).
 *
 * Snapshots are immutable after creation.
 */
export interface PRSnapshot {
  readonly snapshotId: string;

  readonly source: PRSource;

  readonly repositoryOwner?: string;
  readonly repositoryName?: string;
  readonly prNumber?: number;
  readonly commitHash?: string;

  readonly title: string;
  readonly description?: string;

  /** Storage key for the raw unified diff (see {@link RawDiffStorage}). */
  readonly rawDiffS3Key: string;

  readonly changedFiles: ChangedFile[];
  readonly totalChangedLines: number;

  readonly category: PRCategory;
  readonly complexity: PRComplexity;

  readonly importedAt: string;
}

/**
 * Input for importing a manually-uploaded unified diff.
 *
 * `category` / `complexity` are optional manual overrides; when omitted they are
 * classified automatically from the parsed diff.
 */
export interface ImportManualDiffInput {
  readonly title: string;
  readonly description?: string;
  readonly source: ManualDiffSource;
  readonly rawDiff: string;
  readonly category?: PRCategory;
  readonly complexity?: PRComplexity;
}

/**
 * Result of an import operation.
 */
export interface ImportSnapshotResult {
  readonly snapshotId: string;
  readonly reusedExisting: boolean;
}
