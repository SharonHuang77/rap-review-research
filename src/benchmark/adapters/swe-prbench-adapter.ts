import type { BenchmarkDataset } from "../models/benchmark-dataset.ts";
import type { BenchmarkInstance } from "../models/benchmark-instance.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";
import type { IBenchmarkDatasetAdapter } from "./dataset-adapter.ts";

import { DatasetAdapterError } from "../benchmark-errors.ts";

/**
 * Raw SWE-PRBench shapes. SWE-PRBench is the human-agreement benchmark: labels
 * are human review comments on a PR patch, keyed by file + line. They carry no
 * severity/category, so those are left `undefined` on the ground truth.
 * (Assumed contract — see the module README.)
 */
export interface SWEPRBenchReviewComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
  readonly comment_id?: string;
}

export interface SWEPRBenchInstance {
  readonly instance_id: string;
  readonly title?: string;
  readonly patch: string;
  readonly review_comments: SWEPRBenchReviewComment[];
}

export interface SWEPRBenchDataset {
  readonly name?: string;
  readonly instances: SWEPRBenchInstance[];
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
    if (!raw || !Array.isArray(raw.instances)) {
      throw new DatasetAdapterError(
        "SWE-PRBench dataset is missing an `instances` array.",
      );
    }
    return {
      datasetId: "swe-prbench",
      name: raw.name ?? "SWE-PRBench",
      source: this.source,
      instances: raw.instances.map((instance) => this.toInstance(instance)),
    };
  }

  private toInstance(instance: SWEPRBenchInstance): BenchmarkInstance {
    if (!instance.instance_id || typeof instance.patch !== "string") {
      throw new DatasetAdapterError(
        `SWE-PRBench instance is missing instance_id or patch (id="${instance.instance_id ?? ""}").`,
      );
    }
    const groundTruth: GroundTruthIssue[] = (
      instance.review_comments ?? []
    ).map((comment, index) => this.toGroundTruth(instance.instance_id, comment, index));
    return {
      instanceId: instance.instance_id,
      title: instance.title ?? instance.instance_id,
      source: this.source,
      rawDiff: instance.patch,
      groundTruth,
    };
  }

  private toGroundTruth(
    instanceId: string,
    comment: SWEPRBenchReviewComment,
    index: number,
  ): GroundTruthIssue {
    if (!comment.path || typeof comment.line !== "number") {
      throw new DatasetAdapterError(
        `SWE-PRBench comment ${index} in "${instanceId}" is missing path or line.`,
      );
    }
    const body = comment.body ?? "";
    return {
      id: comment.comment_id ?? `${instanceId}-gt-${index}`,
      file: comment.path,
      lineStart: comment.line,
      lineEnd: comment.line,
      // Human comments carry no structured severity/category.
      title: body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX)}…` : body,
      description: body,
    };
  }
}
