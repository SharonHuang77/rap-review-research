import type { ReviewArchitecture } from "../models/experiment.ts";
import type { BenchmarkRun } from "./models/benchmark-run.ts";
import type {
  BenchmarkResult,
  BenchmarkArchitectureSummary,
} from "./models/benchmark-result.ts";

import { GroundTruthEvaluator } from "./ground-truth-evaluator.ts";

export interface BenchmarkEvaluatorDependencies {
  readonly groundTruthEvaluator?: GroundTruthEvaluator;
}

/**
 * Batch front-end over {@link GroundTruthEvaluator}: scores many runs and
 * (optionally) macro-averages them per architecture. Pure and deterministic.
 */
export class BenchmarkEvaluator {
  private readonly evaluator: GroundTruthEvaluator;

  public constructor(deps: BenchmarkEvaluatorDependencies = {}) {
    this.evaluator = deps.groundTruthEvaluator ?? new GroundTruthEvaluator();
  }

  public evaluateRun(run: BenchmarkRun): BenchmarkResult {
    return this.evaluator.evaluate(run);
  }

  public evaluateRuns(runs: BenchmarkRun[]): BenchmarkResult[] {
    return runs.map((run) => this.evaluateRun(run));
  }

  /**
   * Macro-average the results per architecture (each instance weighted equally).
   * Groups are returned in a stable, architecture-name order.
   */
  public summarizeByArchitecture(
    results: BenchmarkResult[],
  ): BenchmarkArchitectureSummary[] {
    const groups = new Map<ReviewArchitecture, BenchmarkResult[]>();
    for (const result of results) {
      const bucket = groups.get(result.architecture) ?? [];
      bucket.push(result);
      groups.set(result.architecture, bucket);
    }

    return [...groups.keys()]
      .sort()
      .map((architecture) => this.summarize(architecture, groups.get(architecture) ?? []));
  }

  private summarize(
    architecture: ReviewArchitecture,
    results: BenchmarkResult[],
  ): BenchmarkArchitectureSummary {
    const n = results.length;
    const mean = (pick: (r: BenchmarkResult) => number): number =>
      n > 0 ? results.reduce((sum, r) => sum + pick(r), 0) / n : 0;
    const total = (pick: (r: BenchmarkResult) => number): number =>
      results.reduce((sum, r) => sum + pick(r), 0);

    return {
      architecture,
      instanceCount: n,
      meanPrecision: mean((r) => r.precision),
      meanRecall: mean((r) => r.recall),
      meanF1: mean((r) => r.f1),
      meanLocalizationAccuracy: mean((r) => r.localizationAccuracy),
      totalTruePositives: total((r) => r.truePositives),
      totalFalsePositives: total((r) => r.falsePositives),
      totalFalseNegatives: total((r) => r.falseNegatives),
    };
  }
}
