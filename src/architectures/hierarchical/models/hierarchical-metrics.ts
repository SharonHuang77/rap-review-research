/**
 * Hierarchical-specific execution metrics. Unlike Agentless (llmCalls = 1,
 * messageCount = 1), hierarchical typically has llmCalls > 1 and messageCount > 1.
 */
export interface HierarchicalMetrics {
  readonly specialistCount: number;
  readonly llmCalls: number;
  readonly messageCount: number;
  readonly duplicateCount: number;
  readonly mergeLatencyMs: number;
}
