import type { BenchmarkDataset } from "../models/benchmark-dataset.ts";
import type { BenchmarkInstance } from "../models/benchmark-instance.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";
import type { IBenchmarkDatasetAdapter } from "./dataset-adapter.ts";

import { normalizeSeverity } from "./normalize-severity.ts";
import { firstDefined, toLineNumber, toStringField } from "./raw-field.ts";
import { DatasetAdapterError } from "../benchmark-errors.ts";

/**
 * Raw Qodo PR-Review-Bench shapes. Qodo is the primary controlled-defect
 * benchmark: each row is a PR diff plus labeled issues with file, line span,
 * category, and severity.
 *
 * Field names are resolved tolerantly (see the alias comments), because the
 * exact upstream spelling may vary between dataset exports/versions. Confirm the
 * real schema at https://huggingface.co/datasets/Qodo/PR-Review-Bench; if a name
 * is missing here, add it to the alias list rather than reshaping the data.
 */
export interface QodoRawIssue {
  readonly issue_id?: string;
  /** file: `file_path` | `file` | `path` | `filename`. */
  readonly file_path?: string;
  readonly file?: string;
  readonly path?: string;
  readonly filename?: string;
  /** start line: `line_start` | `start_line` | `line` | `line_number`. */
  readonly line_start?: number | string;
  readonly start_line?: number | string;
  readonly line?: number | string;
  readonly line_number?: number | string;
  /** end line: `line_end` | `end_line` (defaults to the start line). */
  readonly line_end?: number | string;
  readonly end_line?: number | string;
  /** category: `category` | `type` | `issue_type`. */
  readonly category?: string;
  readonly type?: string;
  readonly issue_type?: string;
  /** severity: `severity` | `priority`. */
  readonly severity?: string;
  readonly priority?: string;
  /** title: `title` | `summary`. */
  readonly title?: string;
  readonly summary?: string;
  /** description: `description` | `body` | `comment` | `text`. */
  readonly description?: string;
  readonly body?: string;
  readonly comment?: string;
  readonly text?: string;
}

export interface QodoRawRow {
  /** id: `id` | `instance_id` | `pr_id` | `pr_number`. */
  readonly id?: string;
  readonly instance_id?: string;
  readonly pr_id?: string;
  readonly pr_number?: number | string;
  /** title: `pr_title` | `title`. */
  readonly pr_title?: string;
  readonly title?: string;
  /** diff: `diff` | `patch` | `pr_diff`. */
  readonly diff?: string;
  readonly patch?: string;
  readonly pr_diff?: string;
  /** issues: `issues` | `review_comments` | `ground_truth` | `labels` | `annotations`. */
  readonly issues?: QodoRawIssue[];
  readonly review_comments?: QodoRawIssue[];
  readonly ground_truth?: QodoRawIssue[];
  readonly labels?: QodoRawIssue[];
  readonly annotations?: QodoRawIssue[];
}

export interface QodoRawDataset {
  readonly dataset_id?: string;
  readonly name?: string;
  /** rows: `rows` | `data` | `instances`. */
  readonly rows?: QodoRawRow[];
  readonly data?: QodoRawRow[];
  readonly instances?: QodoRawRow[];
}

/**
 * Maps Qodo PR-Review-Bench rows into a {@link BenchmarkDataset}, resolving each
 * field from a documented list of aliases. Severity/category are carried through
 * when present (Qodo is the objective-correctness benchmark).
 */
export class QodoPRReviewBenchAdapter
  implements IBenchmarkDatasetAdapter<QodoRawDataset>
{
  public readonly source = "qodo-pr-review-bench" as const;

  public toDataset(raw: QodoRawDataset): BenchmarkDataset {
    const rows = firstDefined(raw?.rows, raw?.data, raw?.instances);
    if (!Array.isArray(rows)) {
      throw new DatasetAdapterError(
        "Qodo dataset is missing a rows array (`rows` | `data` | `instances`).",
      );
    }
    return {
      datasetId: raw.dataset_id ?? "qodo-pr-review-bench",
      name: raw.name ?? "Qodo PR-Review-Bench",
      source: this.source,
      instances: rows.map((row) => this.toInstance(row)),
    };
  }

  private toInstance(row: QodoRawRow): BenchmarkInstance {
    const id = firstDefined(
      row.id,
      row.instance_id,
      row.pr_id,
      toStringField(row.pr_number),
    );
    const diff = firstDefined(row.diff, row.patch, row.pr_diff);
    if (!id || typeof diff !== "string") {
      throw new DatasetAdapterError(
        `Qodo row is missing an id or diff (id="${id ?? ""}").`,
      );
    }
    const rawIssues =
      firstDefined(
        row.issues,
        row.review_comments,
        row.ground_truth,
        row.labels,
        row.annotations,
      ) ?? [];
    return {
      instanceId: id,
      title: firstDefined(row.pr_title, row.title) ?? id,
      source: this.source,
      rawDiff: diff,
      groundTruth: rawIssues.map((issue, index) =>
        this.toGroundTruth(id, issue, index),
      ),
    };
  }

  private toGroundTruth(
    rowId: string,
    issue: QodoRawIssue,
    index: number,
  ): GroundTruthIssue {
    const file = firstDefined(
      issue.file_path,
      issue.file,
      issue.path,
      issue.filename,
    );
    const lineStart = toLineNumber(
      firstDefined(
        issue.line_start,
        issue.start_line,
        issue.line,
        issue.line_number,
      ),
    );
    if (!file || lineStart === undefined) {
      throw new DatasetAdapterError(
        `Qodo issue ${index} in row "${rowId}" is missing a file or start line.`,
      );
    }
    const lineEnd =
      toLineNumber(firstDefined(issue.line_end, issue.end_line)) ?? lineStart;
    return {
      id: issue.issue_id ?? `${rowId}-gt-${index}`,
      file,
      lineStart,
      lineEnd,
      category: firstDefined(issue.category, issue.type, issue.issue_type),
      severity: normalizeSeverity(firstDefined(issue.severity, issue.priority)),
      title: firstDefined(issue.title, issue.summary),
      description: firstDefined(
        issue.description,
        issue.body,
        issue.comment,
        issue.text,
      ),
    };
  }
}
