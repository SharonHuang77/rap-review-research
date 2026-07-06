import type {
  BenchmarkResult,
  BenchmarkArchitectureSummary,
} from "../benchmark/index.ts";
import type { Manifest, ManifestProgress } from "./manifest.ts";
import type { ExecutionOutcome } from "./experiment-executor.ts";

import { BenchmarkEvaluator } from "../benchmark/index.ts";

/** Per-dataset coverage counts. */
export interface DatasetCoverage {
  readonly datasetId: string;
  readonly instanceCount: number;
  readonly completedRuns: number;
}

/** A failed run, preserved for the audit trail (runbook 03 §16). */
export interface CampaignFailure {
  readonly instanceId: string;
  readonly architecture: string;
  readonly run: number;
  readonly attempts: number;
  readonly error: string;
}

/**
 * A reproducible, campaign-level rollup. It reports counts, per-architecture
 * macro metrics (reusing the RFC-13 {@link BenchmarkEvaluator} — no new metric
 * is defined here), dataset coverage, and the failure audit trail.
 */
export interface CampaignSummary {
  readonly campaignId: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly progress: ManifestProgress;
  readonly perArchitecture: BenchmarkArchitectureSummary[];
  readonly datasets: DatasetCoverage[];
  readonly failures: CampaignFailure[];
}

export interface BuildCampaignSummaryInput {
  readonly manifest: Manifest;
  readonly outcomes: ExecutionOutcome[];
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly benchmarkEvaluator?: BenchmarkEvaluator;
}

/**
 * Build the campaign summary from the manifest and the successful outcomes.
 * Pure and deterministic; delegates all metric aggregation to the existing
 * Benchmark Evaluator.
 */
export function buildCampaignSummary(
  input: BuildCampaignSummaryInput,
): CampaignSummary {
  const { manifest, outcomes, startedAt, finishedAt } = input;
  const evaluator = input.benchmarkEvaluator ?? new BenchmarkEvaluator();

  const results: BenchmarkResult[] = outcomes.map((o) => o.benchmarkResult);
  const perArchitecture = evaluator.summarizeByArchitecture(results);

  const datasets = buildDatasetCoverage(outcomes);
  const failures: CampaignFailure[] = manifest
    .entries()
    .filter((e) => e.status === "failed")
    .map((e) => ({
      instanceId: e.instanceId,
      architecture: e.architecture,
      run: e.run,
      attempts: e.attempts,
      error: e.error ?? "unknown error",
    }));

  return {
    campaignId: manifest.campaignId,
    startedAt,
    finishedAt,
    progress: manifest.progress(),
    perArchitecture,
    datasets,
    failures,
  };
}

function buildDatasetCoverage(outcomes: ExecutionOutcome[]): DatasetCoverage[] {
  const byDataset = new Map<string, { instances: Set<string>; runs: number }>();
  for (const outcome of outcomes) {
    const bucket = byDataset.get(outcome.datasetId) ?? {
      instances: new Set<string>(),
      runs: 0,
    };
    bucket.instances.add(outcome.instanceId);
    bucket.runs += 1;
    byDataset.set(outcome.datasetId, bucket);
  }
  return [...byDataset.keys()].sort().map((datasetId) => {
    const bucket = byDataset.get(datasetId) as {
      instances: Set<string>;
      runs: number;
    };
    return {
      datasetId,
      instanceCount: bucket.instances.size,
      completedRuns: bucket.runs,
    };
  });
}
