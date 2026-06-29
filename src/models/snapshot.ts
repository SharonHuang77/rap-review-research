/**
 * An inclusive range of changed line numbers within a file.
 */
export interface ChangedLineRange {
  readonly start: number;
  readonly end: number;
}

/**
 * A single file modified by a pull request, together with the line ranges
 * that changed. The data model lists `changedFiles` and `changedLines`
 * separately; they are composed here so a file always carries its own ranges.
 */
export interface ChangedFile {
  readonly path: string;
  readonly changedLines: ChangedLineRange[];
}

/**
 * Immutable representation of a pull request imported into the platform.
 *
 * A snapshot guarantees that every experiment (and every replay) operates on
 * identical input. Snapshots are created by the PR Import Engine (a future
 * RFC); the Experiment Engine only ever *reads* them.
 *
 * Snapshots are immutable after creation.
 */
export interface PRSnapshot {
  readonly snapshotId: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly commitHash: string;
  readonly title: string;
  readonly description: string;
  readonly rawDiff: string;
  readonly changedFiles: ChangedFile[];
  readonly importedAt: string;
}
