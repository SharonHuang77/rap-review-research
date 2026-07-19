// Cross-family corroboration-depth table (E1 §4 analog on real PRs). Cluster the
// findings with the Nova pair judge; a cluster's depth = number of distinct
// sources (families, or runs for the homo baseline); genuine = the cluster
// representative's judge verdict is `valid`. Same instrument as phase3-hetero-stats.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";
import {
  clusterFindingsSemantically,
  type FindingPairScoreCache,
  type MemberFinding,
} from "../benchmark/matching/finding-pair-judge.ts";
import { TAU_PAIR } from "./finding-pool.ts";

export interface DepthRow { depth: number; genuine: number; total: number }

export function judgeGenuineByDepth(
  sourceFindings: ReadonlyMap<string, ReviewFinding[]>,
  verdicts: Readonly<Record<string, FindingVerdict>>,
  cache: FindingPairScoreCache,
  threshold = TAU_PAIR,
): DepthRow[] {
  const members: MemberFinding[] = [];
  let member = 0;
  for (const [, findings] of sourceFindings) {
    for (const finding of findings) members.push({ finding, member });
    member += 1;                       // one member index per source (family or run)
  }
  const { clusters } = clusterFindingsSemantically(members, cache, threshold);
  const rows = new Map<number, DepthRow>();
  for (const c of clusters) {
    const row = rows.get(c.members.size) ?? { depth: c.members.size, genuine: 0, total: 0 };
    row.total += 1;
    if (verdicts[c.rep.id] === "valid") row.genuine += 1;
    rows.set(c.members.size, row);
  }
  return [...rows.values()].sort((a, b) => a.depth - b.depth);
}
