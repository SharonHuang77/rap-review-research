import type { ReviewFinding } from "../../models/finding.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";

/**
 * Stable, deterministic key for one (finding, issue) pair. LLM-free. Includes
 * the fields the judge actually sees, so a change to any of them is a cache miss.
 */
export function pairKey(finding: ReviewFinding, issue: GroundTruthIssue): string {
  return JSON.stringify([
    finding.file, finding.line, finding.title, finding.description,
    issue.file, issue.lineStart, issue.lineEnd, issue.title ?? "", issue.description ?? "",
  ]);
}

/**
 * A serializable store of judge scores keyed by pair identity (A2). Persisting
 * it makes semantic matching replayable at zero further judge cost.
 */
export class SemanticScoreCache {
  private readonly scores = new Map<string, number>();

  public get(finding: ReviewFinding, issue: GroundTruthIssue): number | undefined {
    return this.scores.get(pairKey(finding, issue));
  }
  public set(finding: ReviewFinding, issue: GroundTruthIssue, score: number): void {
    this.scores.set(pairKey(finding, issue), score);
  }
  public has(finding: ReviewFinding, issue: GroundTruthIssue): boolean {
    return this.scores.has(pairKey(finding, issue));
  }
  public toJSON(): Record<string, number> {
    return Object.fromEntries(this.scores);
  }
  public static fromJSON(data: Record<string, number>): SemanticScoreCache {
    const cache = new SemanticScoreCache();
    for (const [key, value] of Object.entries(data)) {
      cache.scores.set(key, value);
    }
    return cache;
  }
}
