import type { ReviewArchitecture } from "../../models/experiment.ts";
import type { ExperimentMetrics } from "../../evaluation/models/experiment-metrics.ts";
import type { CostAnalysisView } from "./cost-analysis-view.ts";
import type { QualityAnalysisView } from "./quality-analysis-view.ts";

/**
 * The aggregate returned by `getMetrics(experimentId)` — the raw Evaluation
 * Engine metrics plus the presentation-ready Cost and Quality analyses. It is
 * an additive convenience wrapper (RFC-11 Step 7 asks the Metrics service to
 * "aggregate existing metrics into presentation-ready structures"); no metric
 * is recomputed.
 */
export interface MetricsView {
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;
  readonly metrics: ExperimentMetrics;
  readonly cost: CostAnalysisView;
  readonly quality: QualityAnalysisView;
}
