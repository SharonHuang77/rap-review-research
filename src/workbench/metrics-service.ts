import type { IEvaluationEngine } from "../evaluation/index.ts";
import type { IStorageEngine } from "../storage/index.ts";
import type { MetricsView } from "./models/metrics-view.ts";

import { MetricsViewBuilder } from "./builders/metrics-view-builder.ts";
import { ExperimentNotFoundError } from "../shared/errors.ts";
import { WorkbenchArtifactUnavailableError } from "./workbench-errors.ts";

export interface MetricsServiceDependencies {
  readonly storage: IStorageEngine;
  readonly evaluation: IEvaluationEngine;
  readonly builder?: MetricsViewBuilder;
}

/**
 * Aggregates an experiment's existing evaluation metrics into a presentation
 * {@link MetricsView} (RFC-11 §7). It delegates all metric computation to the
 * Evaluation Engine and only reshapes the result — it never recomputes a metric.
 */
export class MetricsService {
  private readonly storage: IStorageEngine;
  private readonly evaluation: IEvaluationEngine;
  private readonly builder: MetricsViewBuilder;

  public constructor(deps: MetricsServiceDependencies) {
    this.storage = deps.storage;
    this.evaluation = deps.evaluation;
    this.builder = deps.builder ?? new MetricsViewBuilder();
  }

  public async getMetrics(experimentId: string): Promise<MetricsView> {
    const stored = await this.storage.getExperimentResult(experimentId);
    if (!stored) {
      throw new ExperimentNotFoundError(
        `No stored artifacts for experiment "${experimentId}".`,
      );
    }
    if (!stored.validatedResult) {
      throw new WorkbenchArtifactUnavailableError(
        `Experiment "${experimentId}" has no validated result to present metrics for.`,
      );
    }

    const metrics = this.evaluation.evaluate(stored);
    return this.builder.build(metrics);
  }
}
