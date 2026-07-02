import type { AgentRole } from "../messages.ts";
import type { ReviewFinding } from "../../../models/finding.ts";

/**
 * A single specialist's review output, preserved for replay/visualization.
 *
 * NOTE: `estimatedCostUsd` is added beyond RFC-08 §19 — the provider returns it
 * and summing actual per-call cost is more accurate than re-deriving it. See the
 * module README / compliance report.
 */
export interface SpecialistReviewResult {
  readonly role: AgentRole;
  readonly summary: string;
  readonly findings: ReviewFinding[];
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
}
