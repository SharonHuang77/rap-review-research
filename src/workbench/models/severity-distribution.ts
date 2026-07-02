/**
 * Per-severity finding counts, projected verbatim from the Evaluation Engine's
 * {@link ReviewQualityMetrics}. Presentation-only: no counting happens here.
 */
export interface SeverityDistribution {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}
