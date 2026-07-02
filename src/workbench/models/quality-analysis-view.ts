import type { ReviewArchitecture } from "../../models/experiment.ts";
import type { ComparisonChart } from "./comparison-chart.ts";
import type { SeverityDistribution } from "./severity-distribution.ts";

/**
 * The Quality Analysis page (RFC-11 §6): review-quality signals for one
 * experiment plus ready-to-render charts. Projected from
 * {@link ReviewQualityMetrics} and {@link ResearchEvidenceMetrics}; nothing is
 * recomputed.
 */
export interface QualityAnalysisView {
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;
  readonly findingCount: number;
  readonly severityDistribution: SeverityDistribution;
  readonly averageConfidence: number;
  readonly duplicateFindingCount: number;
  readonly evidenceScore: number;
  readonly charts: ComparisonChart[];
}
