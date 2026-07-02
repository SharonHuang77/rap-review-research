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
 * execution-level metrics the Experiment Engine records (RFC-03 shape).
 *
 * `summary` and `findings` carry the architecture's self-reported review, while
 * `rawOutput` keeps the original unstructured payload. All three are untrusted:
 * the Experiment Engine never inspects them — turning them into a validated
 * result is the job of the Validation Engine (a future RFC). `findings` is
 * therefore typed as `unknown`.
 */
export interface RawReviewResult {
  readonly architecture: ReviewArchitecture;
  readonly summary: string;
  readonly rawOutput: unknown;
  readonly findings: unknown;

  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly estimatedCostUsd: number;
  /** Number of inter-agent messages (0/1 for single-agent architectures). */
  readonly messageCount: number;
  /** Number of LLM provider calls made during execution (RFC-04). */
  readonly llmCalls: number;
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
