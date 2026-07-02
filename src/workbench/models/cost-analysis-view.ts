import type { ReviewArchitecture } from "../../models/experiment.ts";
import type { ComparisonChart } from "./comparison-chart.ts";

/**
 * The Cost Analysis page (RFC-11 §6): operational-cost signals for one
 * experiment plus ready-to-render charts. Projected from
 * {@link OperationalCostMetrics}; `totalTokens` is a display convenience
 * (input + output), not a new metric.
 */
export interface CostAnalysisView {
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly llmCalls: number;
  readonly messageCount: number;
  readonly charts: ComparisonChart[];
}
