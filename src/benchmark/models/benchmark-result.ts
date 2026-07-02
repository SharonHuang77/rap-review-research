import type { ReviewArchitecture } from "../../models/experiment.ts";

/**
 * Ground-truth metrics for one {@link BenchmarkRun} (one architecture on one
 * instance).
 *
 * `truePositives`/`falsePositives`/`falseNegatives` come from a one-to-one match
 * between produced findings and ground-truth issues (file + line-range overlap).
 * `localizationAccuracy` is the fraction of *detected* issues (right file) that
 * were also localized to the right line span.
 *
 * `instanceId` + `architecture` identify a cell of the comparison grid; keeping
 * the same `instanceId` across architectures preserves the cross-architecture
 * comparison in downstream exports.
 */
export interface BenchmarkResult {
  readonly runId: string;
  readonly datasetId: string;
  readonly instanceId: string;
  readonly snapshotId: string;
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;

  readonly groundTruthCount: number;
  readonly producedCount: number;

  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;

  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly localizationAccuracy: number;
}

/**
 * A macro-average of {@link BenchmarkResult}s for one architecture across a
 * dataset subset. Means are unweighted across instances (each instance counts
 * equally), which is the standard reporting choice for per-instance metrics.
 */
export interface BenchmarkArchitectureSummary {
  readonly architecture: ReviewArchitecture;
  readonly instanceCount: number;
  readonly meanPrecision: number;
  readonly meanRecall: number;
  readonly meanF1: number;
  readonly meanLocalizationAccuracy: number;
  readonly totalTruePositives: number;
  readonly totalFalsePositives: number;
  readonly totalFalseNegatives: number;
}
