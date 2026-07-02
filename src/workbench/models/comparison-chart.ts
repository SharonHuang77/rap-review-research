/**
 * A presentation-only chart model (RFC-11 §8). It carries already-computed
 * numbers for a UI to render; no metric calculation ever happens in this model
 * or the builders that produce it.
 *
 * `labels[i]` corresponds to `values[i]`; the two arrays are always the same
 * length.
 */
export interface ComparisonChart {
  readonly title: string;
  readonly labels: string[];
  readonly values: number[];
}
