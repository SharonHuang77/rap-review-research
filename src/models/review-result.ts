import type { ReviewArchitecture } from "./experiment.ts";
import type { PRSnapshot } from "./snapshot.ts";
import type { ReviewFinding, RiskLevel } from "./finding.ts";

/**
 * The uniform input every review architecture receives.
 *
 * Identical for all architectures so that communication topology remains the
 * only independent variable.
 */
export interface ReviewExecutionInput {
  readonly experimentId: string;
  readonly snapshot: PRSnapshot;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly workflowVersion: string;
}

/**
 * The unvalidated output of a review architecture, together with the
 * execution-level metrics the Experiment Engine records.
 *
 * `rawOutput` is deliberately typed as `unknown`: the Experiment Engine must
 * not trust model output and never inspects its shape — that is the job of the
 * Validation Engine (a future RFC).
 */
export interface RawReviewResult {
  readonly architecture: ReviewArchitecture;
  readonly rawOutput: unknown;
  readonly rawOutputText?: string;

  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly latencyMs: number;
  readonly messageCount: number;
}

/**
 * The structured, schema-safe result produced after validation.
 *
 * Returned by the validation port (see `IOutputValidator`). The real schema
 * validation that produces this is owned by the Validation Engine RFC.
 */
export interface ValidatedReviewResult {
  readonly architecture: ReviewArchitecture;
  readonly summary: string;
  readonly riskLevel: RiskLevel;
  readonly findings: ReviewFinding[];
  readonly messageCount: number;
}
