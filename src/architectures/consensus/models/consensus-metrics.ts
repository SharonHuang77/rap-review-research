/**
 * Consensus-specific execution metrics. The core metrics (llmCalls, messageCount)
 * flow into RawReviewResult; the rest are architecture artifacts for future
 * dashboard/replay work.
 */
export interface ConsensusMetrics {
  readonly specialistCount: number;
  readonly candidateFindingCount: number;
  readonly acceptedFindingCount: number;
  readonly rejectedFindingCount: number;
  readonly needsReviewFindingCount: number;
  readonly voteCount: number;
  readonly agreementRate: number;
  readonly revisionCount: number;
  readonly duplicateCount: number;
  readonly llmCalls: number;
  readonly messageCount: number;
  // Aggregate LLM usage across all rounds (review + revision + voting). Added
  // beyond RFC-09 §19 so RawReviewResult token/latency/cost cover every call.
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly estimatedCostUsd: number;
}
