import type { ReviewFinding } from "../../models/finding.ts";
import type {
  PRSource,
  PRCategory,
  PRComplexity,
} from "../../models/snapshot.ts";
import type { ExperimentMetrics } from "../../evaluation/models/experiment-metrics.ts";
import type { ExperimentSummaryView } from "./experiment-summary-view.ts";

/**
 * Presentation projection of the PR snapshot an experiment reviewed. The raw
 * unified diff (a large artifact) is intentionally excluded.
 */
export interface PRSummaryView {
  readonly snapshotId: string;
  readonly title: string;
  readonly description?: string;
  readonly source: PRSource;
  readonly category: PRCategory;
  readonly complexity: PRComplexity;
  readonly changedFileCount: number;
  readonly totalChangedLines: number;
}

/**
 * The Experiment Detail page (RFC-11 §6): metadata, PR summary, findings, the
 * raw and validated review output, and the evaluation metrics. Every field is a
 * projection of already-stored artifacts — nothing is computed here.
 *
 * Fields are `null` when the corresponding artifact is absent (e.g. an
 * experiment that has not completed validation has no `metrics`).
 */
export interface ExperimentDetailView {
  readonly summary: ExperimentSummaryView;
  readonly pr: PRSummaryView | null;
  readonly reviewSummary: string | null;
  readonly findings: ReviewFinding[];
  readonly rawOutput: unknown | null;
  readonly metrics: ExperimentMetrics | null;
}
