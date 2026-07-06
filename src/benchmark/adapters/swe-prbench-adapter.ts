import type { BenchmarkDataset } from "../models/benchmark-dataset.ts";
import type { BenchmarkInstance } from "../models/benchmark-instance.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";
import type { IBenchmarkDatasetAdapter } from "./dataset-adapter.ts";

import { firstDefined, toLineNumber, toStringField } from "./raw-field.ts";
import { DatasetAdapterError } from "../benchmark-errors.ts";

/**
 * Raw SWE-PRBench shapes. SWE-PRBench is the human-agreement benchmark: labels
 * are human review comments on a PR patch, keyed by file + line. They carry no
 * severity/category, so those are left `undefined` on the ground truth.
 *
 * Field names are resolved tolerantly (see the alias comments) so a real export
 * maps without reshaping. Confirm the schema against the published dataset
 * (arXiv:2603.26130) and extend the alias lists if a name is missing.
 */
export interface SWEPRBenchReviewComment {
  readonly comment_id?: string;
  /** file: `path` | `file` | `file_path`. */
  readonly path?: string;
  readonly file?: string;
  readonly file_path?: string;
  /** line: `line` | `line_number` | `original_line` | `start_line`. */
  readonly line?: number | string;
  readonly line_number?: number | string;
  readonly original_line?: number | string;
  readonly start_line?: number | string;
  /** body: `body` | `text` | `comment` | `message`. */
  readonly body?: string;
  readonly text?: string;
  readonly comment?: string;
  readonly message?: string;
}

export interface SWEPRBenchInstance {
  /** id: `instance_id` | `id` | `pr_id`. */
  readonly instance_id?: string;
  readonly id?: string;
  readonly pr_id?: string;
  /** title: `title` | `pr_title`. */
  readonly title?: string;
  readonly pr_title?: string;
  /** patch: `patch` | `diff`. */
  readonly patch?: string;
  readonly diff?: string;
  /** comments: `review_comments` | `comments` | `reviews`. */
  readonly review_comments?: SWEPRBenchReviewComment[];
  readonly comments?: SWEPRBenchReviewComment[];
  readonly reviews?: SWEPRBenchReviewComment[];
}

export interface SWEPRBenchDataset {
  readonly name?: string;
  /** instances: `instances` | `data` | `rows`. */
  readonly instances?: SWEPRBenchInstance[];
  readonly data?: SWEPRBenchInstance[];
  readonly rows?: SWEPRBenchInstance[];
}

const TITLE_MAX = 80;

/**
 * Maps SWE-PRBench instances into a {@link BenchmarkDataset}. Each human review
 * comment becomes one ground-truth issue located at its (file, line); the
 * comment body is used as both title (truncated) and description. Severity and
 * category are absent, so matching that depends on them is skipped downstream.
 */
export class SWEPRBenchAdapter
  implements IBenchmarkDatasetAdapter<SWEPRBenchDataset>
{
  public readonly source = "swe-prbench" as const;

  public toDataset(raw: SWEPRBenchDataset): BenchmarkDataset {
    const instances = firstDefined(raw?.instances, raw?.data, raw?.rows);
    if (!Array.isArray(instances)) {
      throw new DatasetAdapterError(
        "SWE-PRBench dataset is missing an instances array (`instances` | `data` | `rows`).",
      );
    }
    return {
      datasetId: "swe-prbench",
      name: raw.name ?? "SWE-PRBench",
      source: this.source,
      instances: instances.map((instance) => this.toInstance(instance)),
    };
  }

  private toInstance(instance: SWEPRBenchInstance): BenchmarkInstance {
    const id = firstDefined(instance.instance_id, instance.id, instance.pr_id);
    const patch = firstDefined(instance.patch, instance.diff);
    if (!id || typeof patch !== "string") {
      throw new DatasetAdapterError(
        `SWE-PRBench instance is missing instance_id or patch (id="${id ?? ""}").`,
      );
    }
    const comments =
      firstDefined(instance.review_comments, instance.comments, instance.reviews) ??
      [];
    return {
      instanceId: id,
      title: firstDefined(instance.title, instance.pr_title) ?? id,
      source: this.source,
      rawDiff: patch,
      groundTruth: comments.map((comment, index) =>
        this.toGroundTruth(id, comment, index),
      ),
    };
  }

  private toGroundTruth(
    instanceId: string,
    comment: SWEPRBenchReviewComment,
    index: number,
  ): GroundTruthIssue {
    const file = firstDefined(comment.path, comment.file, comment.file_path);
    const line = toLineNumber(
      firstDefined(
        comment.line,
        comment.line_number,
        comment.original_line,
        comment.start_line,
      ),
    );
    if (!file || line === undefined) {
      throw new DatasetAdapterError(
        `SWE-PRBench comment ${index} in "${instanceId}" is missing a path or line.`,
      );
    }
    const body =
      toStringField(
        firstDefined(comment.body, comment.text, comment.comment, comment.message),
      ) ?? "";
    return {
      id: comment.comment_id ?? `${instanceId}-gt-${index}`,
      file,
      lineStart: line,
      lineEnd: line,
      // Human comments carry no structured severity/category.
      title: body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX)}…` : body,
      description: body,
    };
  }
}
