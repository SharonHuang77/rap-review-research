import { DomainError } from "../shared/errors.ts";

/**
 * Typed errors for the Evaluation Engine (RFC-07). `EvaluationError` is the
 * base (its `code` is `string` so subclasses can override it), thrown when a
 * required experiment artifact is missing.
 */
export class EvaluationError extends DomainError {
  public readonly code: string = "EVALUATION_ERROR";
}

/** A specific metric calculation failed; identifies the failing metric. */
export class MetricCalculationError extends EvaluationError {
  public override readonly code = "METRIC_CALCULATION_ERROR";
}

/** Comparison generation across experiments failed. */
export class ComparisonError extends EvaluationError {
  public override readonly code = "COMPARISON_ERROR";
}
