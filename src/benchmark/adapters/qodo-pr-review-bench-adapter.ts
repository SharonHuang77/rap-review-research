import type { BenchmarkDataset } from "../models/benchmark-dataset.ts";
import type { BenchmarkInstance } from "../models/benchmark-instance.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";
import type { IBenchmarkDatasetAdapter } from "./dataset-adapter.ts";

import { normalizeSeverity } from "./normalize-severity.ts";
import { DatasetAdapterError } from "../benchmark-errors.ts";

/**
 * Raw Qodo PR-Review-Bench shapes. This mirrors the dataset's controlled-defect
 * layout: each row is a PR diff plus a list of labeled issues with file, line
 * span, category, and severity. (The exact upstream field names may differ; this
 * is the assumed contract — see the module README.)
 */
export interface QodoRawIssue {
  readonly issue_id?: string;
  readonly file_path: string;
  readonly line_start: number;
  readonly line_end?: number;
  readonly category?: string;
  readonly severity?: string;
  readonly title?: string;
  readonly description?: string;
}

export interface QodoRawRow {
  readonly id: string;
  readonly pr_title?: string;
  readonly diff: string;
  readonly issues: QodoRawIssue[];
}

export interface QodoRawDataset {
  readonly dataset_id?: string;
  readonly name?: string;
  readonly rows: QodoRawRow[];
}

/**
 * Maps Qodo PR-Review-Bench rows into a {@link BenchmarkDataset}. Qodo is the
 * primary quantitative benchmark (controlled defect detection), so severity and
 * category are carried through when present.
 */
export class QodoPRReviewBenchAdapter
  implements IBenchmarkDatasetAdapter<QodoRawDataset>
{
  public readonly source = "qodo-pr-review-bench" as const;

  public toDataset(raw: QodoRawDataset): BenchmarkDataset {
    if (!raw || !Array.isArray(raw.rows)) {
      throw new DatasetAdapterError("Qodo dataset is missing a `rows` array.");
    }
    const instances = raw.rows.map((row) => this.toInstance(row));
    return {
      datasetId: raw.dataset_id ?? "qodo-pr-review-bench",
      name: raw.name ?? "Qodo PR-Review-Bench",
      source: this.source,
      instances,
    };
  }

  private toInstance(row: QodoRawRow): BenchmarkInstance {
    if (!row.id || typeof row.diff !== "string") {
      throw new DatasetAdapterError(
        `Qodo row is missing an id or diff (id="${row.id ?? ""}").`,
      );
    }
    const groundTruth: GroundTruthIssue[] = (row.issues ?? []).map(
      (issue, index) => this.toGroundTruth(row.id, issue, index),
    );
    return {
      instanceId: row.id,
      title: row.pr_title ?? row.id,
      source: this.source,
      rawDiff: row.diff,
      groundTruth,
    };
  }

  private toGroundTruth(
    rowId: string,
    issue: QodoRawIssue,
    index: number,
  ): GroundTruthIssue {
    if (!issue.file_path || typeof issue.line_start !== "number") {
      throw new DatasetAdapterError(
        `Qodo issue ${index} in row "${rowId}" is missing file_path or line_start.`,
      );
    }
    return {
      id: issue.issue_id ?? `${rowId}-gt-${index}`,
      file: issue.file_path,
      lineStart: issue.line_start,
      lineEnd: issue.line_end ?? issue.line_start,
      category: issue.category,
      severity: normalizeSeverity(issue.severity),
      title: issue.title,
      description: issue.description,
    };
  }
}
