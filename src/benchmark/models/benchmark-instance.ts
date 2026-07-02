import type { BenchmarkSource } from "./benchmark-dataset.ts";
import type { GroundTruthIssue } from "./ground-truth-issue.ts";

/**
 * One PR-review case from a benchmark dataset.
 *
 * `rawDiff` is a unified diff so the instance can be imported through the
 * existing PR Import Engine into an immutable {@link PRSnapshot} — that is what
 * lets every architecture (Agentless, Hierarchical, Consensus) review the exact
 * same input, preserving the cross-architecture comparison.
 *
 * `groundTruth` is the labeled set of issues the review should have found.
 */
export interface BenchmarkInstance {
  readonly instanceId: string;
  readonly title: string;
  readonly source: BenchmarkSource;
  readonly rawDiff: string;
  readonly groundTruth: GroundTruthIssue[];
  readonly metadata?: Readonly<Record<string, string>>;
}
