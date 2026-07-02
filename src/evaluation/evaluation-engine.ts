import type { StoredExperimentResult } from "../storage/stored-models.ts";
import type { Logger } from "../shared/logger.ts";
import type { ExperimentMetrics } from "./models/experiment-metrics.ts";
import type { ExperimentComparison } from "./models/experiment-comparison.ts";
import type { IEvidenceScorer } from "./scorers/evidence-scorer.ts";

import { NoopLogger } from "../shared/logger.ts";
import { FindingMetricsCalculator } from "./finding-metrics.ts";
import { CostMetricsCalculator } from "./cost-metrics.ts";
import { EvidenceMetricsCalculator } from "./evidence-metrics.ts";
import { ComparisonEngine } from "./comparison-engine.ts";
import { HeuristicEvidenceScorer } from "./scorers/heuristic-evidence-scorer.ts";
import { EvaluationError, MetricCalculationError } from "./evaluation-errors.ts";

/**
 * Public contract of the Research Evaluation Engine (RFC-07).
 */
export interface IEvaluationEngine {
  /** Evaluate one completed experiment into metrics. */
  evaluate(result: StoredExperimentResult): ExperimentMetrics;
  /** Evaluate many experiments and group them into architecture comparisons. */
  evaluateBatch(results: StoredExperimentResult[]): ExperimentComparison[];
}

export interface EvaluationEngineDependencies {
  /** The engine depends only on this interface for evidence scoring (RFC-07 §11). */
  readonly evidenceScorer?: IEvidenceScorer;
  readonly findingCalculator?: FindingMetricsCalculator;
  readonly costCalculator?: CostMetricsCalculator;
  readonly comparisonEngine?: ComparisonEngine;
  readonly logger?: Logger;
}

/**
 * Orchestrates the metric calculators to turn stored experiment artifacts into
 * research metrics. It contains no calculation logic itself — each calculator
 * owns one responsibility — and is stateless and deterministic.
 *
 * It never accesses repositories or external services; it operates only on the
 * supplied {@link StoredExperimentResult} objects.
 */
export class EvaluationEngine implements IEvaluationEngine {
  private readonly findingCalculator: FindingMetricsCalculator;
  private readonly costCalculator: CostMetricsCalculator;
  private readonly evidenceCalculator: EvidenceMetricsCalculator;
  private readonly comparisonEngine: ComparisonEngine;
  private readonly logger: Logger;

  public constructor(deps: EvaluationEngineDependencies = {}) {
    this.findingCalculator =
      deps.findingCalculator ?? new FindingMetricsCalculator();
    this.costCalculator = deps.costCalculator ?? new CostMetricsCalculator();
    this.evidenceCalculator = new EvidenceMetricsCalculator(
      deps.evidenceScorer ?? new HeuristicEvidenceScorer(),
    );
    this.comparisonEngine = deps.comparisonEngine ?? new ComparisonEngine();
    this.logger = deps.logger ?? new NoopLogger();
  }

  public evaluate(result: StoredExperimentResult): ExperimentMetrics {
    const validated = result.validatedResult;
    if (!validated) {
      // A required artifact is missing — the experiment did not complete
      // validation, so there is nothing trustworthy to evaluate.
      throw new EvaluationError(
        `Cannot evaluate experiment "${result.experimentId}": no validated result.`,
      );
    }

    const reviewQuality = this.run("reviewQuality", result, (r) =>
      this.findingCalculator.calculate(r),
    );
    const operationalCost = this.run("operationalCost", result, (r) =>
      this.costCalculator.calculate(r),
    );
    const researchEvidence = this.run("researchEvidence", result, (r) =>
      this.evidenceCalculator.calculate(r),
    );

    this.logger.info("Evaluated experiment", {
      experimentId: result.experimentId,
      architecture: validated.architecture,
    });

    return {
      experimentId: result.experimentId,
      architecture: validated.architecture,
      reviewQuality,
      operationalCost,
      researchEvidence,
    };
  }

  public evaluateBatch(
    results: StoredExperimentResult[],
  ): ExperimentComparison[] {
    const metrics = results.map((result) => this.evaluate(result));
    return this.comparisonEngine.compare(metrics);
  }

  /** Run one calculator, surfacing failures as a metric-scoped typed error. */
  private run<T>(
    metric: string,
    result: StoredExperimentResult,
    calculate: (result: StoredExperimentResult) => T,
  ): T {
    try {
      return calculate(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MetricCalculationError(
        `Failed to compute "${metric}" for experiment "${result.experimentId}": ${message}`,
      );
    }
  }
}

/**
 * Composition helper: an Evaluation Engine wired with the default calculators
 * and the heuristic evidence scorer.
 */
export function createEvaluationEngine(
  deps: EvaluationEngineDependencies = {},
): EvaluationEngine {
  return new EvaluationEngine(deps);
}
