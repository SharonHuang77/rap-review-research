import type { ExperimentMetrics } from "./experiment-metrics.ts";

/**
 * A side-by-side comparison of the architectures that reviewed the same PR
 * snapshot.
 *
 * `experimentId` holds the shared grouping identifier — the PR snapshot id that
 * the compared experiments have in common (see ComparisonEngine). `architectures`
 * lists one {@link ExperimentMetrics} per architecture (Agentless, Hierarchical,
 * Consensus). The object carries no presentation logic.
 */
export interface ExperimentComparison {
  readonly experimentId: string;
  readonly architectures: ExperimentMetrics[];
}
