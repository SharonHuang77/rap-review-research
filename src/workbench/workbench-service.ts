import type { IEvaluationEngine } from "../evaluation/index.ts";
import type { IStorageEngine } from "../storage/index.ts";
import type { ExperimentMetrics } from "../evaluation/models/experiment-metrics.ts";
import type { Logger } from "../shared/logger.ts";

import type { ExperimentSummaryView } from "./models/experiment-summary-view.ts";
import type { ExperimentDetailView } from "./models/experiment-detail-view.ts";
import type { ArchitectureComparisonView } from "./models/architecture-comparison-view.ts";
import type { ReplayView } from "./models/replay-step.ts";
import type { MetricsView } from "./models/metrics-view.ts";
import type { ExportHistoryView } from "./models/export-history-view.ts";
import type { ExperimentReadPort, SnapshotReadPort } from "./ports.ts";
import type { ReplayService } from "./replay-service.ts";
import type { ComparisonService } from "./comparison-service.ts";
import type { MetricsService } from "./metrics-service.ts";
import type { ExportHistoryService } from "./export-history-service.ts";

import { ExperimentSummaryViewBuilder } from "./builders/experiment-summary-view-builder.ts";
import { ExperimentDetailViewBuilder } from "./builders/experiment-detail-view-builder.ts";
import { ExperimentNotFoundError } from "../shared/errors.ts";
import { NoopLogger } from "../shared/logger.ts";

/**
 * The single interface the Workbench UI depends on (RFC-11 §9). Every method is
 * read-only; the Workbench visualizes artifacts and never executes experiments,
 * calls an LLM, or computes metrics.
 */
export interface IResearchWorkbench {
  getExperiments(): Promise<ExperimentSummaryView[]>;
  getExperiment(id: string): Promise<ExperimentDetailView>;
  getComparison(snapshotId: string): Promise<ArchitectureComparisonView>;
  getReplay(experimentId: string): Promise<ReplayView>;
  getMetrics(experimentId: string): Promise<MetricsView>;
  getExportHistory(): Promise<ExportHistoryView>;
}

export interface WorkbenchServiceDependencies {
  readonly experiments: ExperimentReadPort;
  readonly snapshots: SnapshotReadPort;
  readonly storage: IStorageEngine;
  readonly evaluation: IEvaluationEngine;
  readonly replayService: ReplayService;
  readonly comparisonService: ComparisonService;
  readonly metricsService: MetricsService;
  readonly exportHistoryService: ExportHistoryService;
  readonly summaryBuilder?: ExperimentSummaryViewBuilder;
  readonly detailBuilder?: ExperimentDetailViewBuilder;
  readonly logger?: Logger;
}

/**
 * Aggregates the platform's read-side services into presentation-ready view
 * models. It orchestrates (list/load, dispatch to the focused sub-services) and
 * delegates every domain→presentation transform to a builder — no view model is
 * hand-assembled with business logic here.
 *
 * Deterministic and read-only: it depends only on Storage, Evaluation, and the
 * read ports; never on Bedrock, the Prompt Builder, or the review architectures
 * (RFC-11 §10).
 */
export class WorkbenchService implements IResearchWorkbench {
  private readonly experiments: ExperimentReadPort;
  private readonly snapshots: SnapshotReadPort;
  private readonly storage: IStorageEngine;
  private readonly evaluation: IEvaluationEngine;
  private readonly replayService: ReplayService;
  private readonly comparisonService: ComparisonService;
  private readonly metricsService: MetricsService;
  private readonly exportHistoryService: ExportHistoryService;
  private readonly summaryBuilder: ExperimentSummaryViewBuilder;
  private readonly detailBuilder: ExperimentDetailViewBuilder;
  private readonly logger: Logger;

  public constructor(deps: WorkbenchServiceDependencies) {
    this.experiments = deps.experiments;
    this.snapshots = deps.snapshots;
    this.storage = deps.storage;
    this.evaluation = deps.evaluation;
    this.replayService = deps.replayService;
    this.comparisonService = deps.comparisonService;
    this.metricsService = deps.metricsService;
    this.exportHistoryService = deps.exportHistoryService;
    this.summaryBuilder =
      deps.summaryBuilder ?? new ExperimentSummaryViewBuilder();
    this.detailBuilder =
      deps.detailBuilder ?? new ExperimentDetailViewBuilder();
    this.logger = deps.logger ?? new NoopLogger();
  }

  public async getExperiments(): Promise<ExperimentSummaryView[]> {
    const experiments = await this.experiments.list();
    return experiments.map((e) => this.summaryBuilder.build(e));
  }

  public async getExperiment(id: string): Promise<ExperimentDetailView> {
    const experiment = await this.experiments.getById(id);
    if (!experiment) {
      throw new ExperimentNotFoundError(`Experiment "${id}" does not exist.`);
    }

    const [snapshot, stored] = await Promise.all([
      this.snapshots.getById(experiment.snapshotId),
      this.storage.getExperimentResult(id),
    ]);

    // Metrics are available only once validation has succeeded.
    let metrics: ExperimentMetrics | null = null;
    if (stored && stored.validatedResult) {
      metrics = this.evaluation.evaluate(stored);
    }

    this.logger.info("Built experiment detail view", { experimentId: id });
    return this.detailBuilder.build({
      summary: this.summaryBuilder.build(experiment),
      snapshot,
      stored,
      metrics,
    });
  }

  public getComparison(
    snapshotId: string,
  ): Promise<ArchitectureComparisonView> {
    return this.comparisonService.getComparison(snapshotId);
  }

  public getReplay(experimentId: string): Promise<ReplayView> {
    return this.replayService.getReplay(experimentId);
  }

  public getMetrics(experimentId: string): Promise<MetricsView> {
    return this.metricsService.getMetrics(experimentId);
  }

  public getExportHistory(): Promise<ExportHistoryView> {
    return this.exportHistoryService.getExportHistory();
  }
}
