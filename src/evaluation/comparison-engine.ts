import type { ExperimentMetrics } from "./models/experiment-metrics.ts";
import type { ExperimentComparison } from "./models/experiment-comparison.ts";

/**
 * Groups per-experiment metrics into side-by-side architecture comparisons.
 *
 * Experiments that reviewed the same PR snapshot are grouped together. The
 * grouping key is the snapshot id, derived from the experiment id — which is
 * the deterministic idempotency key `snapshotId#architecture#…` (RFC-01), so
 * the snapshot id is the segment before the first `#`. (See README: a future
 * reconciliation could carry `snapshotId` on stored results directly.)
 *
 * Pure and deterministic: groups and their members are returned in a stable
 * order and inputs are never mutated.
 */
export class ComparisonEngine {
  public compare(metrics: ExperimentMetrics[]): ExperimentComparison[] {
    const groups = new Map<string, ExperimentMetrics[]>();
    for (const m of metrics) {
      const key = snapshotKey(m.experimentId);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(m);
      } else {
        groups.set(key, [m]);
      }
    }

    return [...groups.keys()].sort().map((key) => ({
      experimentId: key,
      architectures: [...(groups.get(key) ?? [])].sort(byArchitectureThenId),
    }));
  }
}

function snapshotKey(experimentId: string): string {
  const hash = experimentId.indexOf("#");
  return hash === -1 ? experimentId : experimentId.slice(0, hash);
}

function byArchitectureThenId(
  a: ExperimentMetrics,
  b: ExperimentMetrics,
): number {
  if (a.architecture !== b.architecture) {
    return a.architecture < b.architecture ? -1 : 1;
  }
  if (a.experimentId === b.experimentId) {
    return 0;
  }
  return a.experimentId < b.experimentId ? -1 : 1;
}
