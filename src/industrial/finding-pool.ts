// Pooled pseudo-ground-truth for E3 (no human ground truth). A cluster is a
// finding corroborated by >=2 independent SOURCES (model families), clustered
// with the SAME Nova pair judge E1 uses (finding-pair-judge). Leave-one-out
// excludes a named source so an arm never defines the reference it's scored
// against. Zero-LLM: all pair scores come from the persisted cache.
import type { ReviewFinding } from "../models/finding.ts";
import {
  clusterFindingsSemantically,
  type FindingPairScoreCache,
  type MemberFinding,
} from "../benchmark/matching/finding-pair-judge.ts";

/** Frozen pair-judge threshold — identical to E1 (Comparability Contract). */
export const TAU_PAIR = 0.7;

export interface PoolCluster {
  rep: ReviewFinding;
  sources: Set<string>;      // distinct source labels corroborating this issue
  findings: ReviewFinding[];
}
export interface BuildPoolOptions {
  minSources?: number;       // default 2
  excludeSource?: string;    // leave-one-out (drop this source label)
  threshold?: number;        // pair-judge τ, default TAU_PAIR
}

/**
 * Cluster findings across sources with the Nova pair judge, keeping clusters hit
 * by >= minSources distinct sources. `sourceFindings` maps a source LABEL (a
 * model family such as the Haiku/Kimi/GLM agentless review) to its findings.
 */
export function buildPool(
  sourceFindings: ReadonlyMap<string, ReviewFinding[]>,
  cache: FindingPairScoreCache,
  options: BuildPoolOptions = {},
): PoolCluster[] {
  const minSources = options.minSources ?? 2;
  const threshold = options.threshold ?? TAU_PAIR;
  const labels: string[] = [];
  const members: MemberFinding[] = [];
  for (const [source, findings] of sourceFindings) {
    if (source === options.excludeSource) continue;
    const member = labels.length;    // one member index per source
    labels.push(source);
    for (const finding of findings) members.push({ finding, member });
  }
  const { clusters } = clusterFindingsSemantically(members, cache, threshold);
  return clusters
    .filter((c) => c.members.size >= minSources)
    .map((c) => ({
      rep: c.rep,
      sources: new Set([...c.members].map((m) => labels[m]!)),
      findings: [...c.findings],
    }));
}

/**
 * Recall proxy: fraction of pool clusters an arm's findings match, using the
 * SAME pair judge (a cached pair score >= threshold, or finding identity). 0
 * when the pool is empty. Requires the runner to have judged arm↔family pairs
 * (Task 6 judges the family ∪ arm union), else an unjudged pair reads as no-match.
 */
export function poolCoverage(
  armFindings: readonly ReviewFinding[],
  pool: readonly PoolCluster[],
  cache: FindingPairScoreCache,
  threshold = TAU_PAIR,
): number {
  if (pool.length === 0) return 0;
  const covered = pool.filter((c) =>
    armFindings.some((af) =>
      c.findings.some((cf) => cf.id === af.id || (cache.get(af, cf) ?? 0) >= threshold),
    ),
  ).length;
  return covered / pool.length;
}
