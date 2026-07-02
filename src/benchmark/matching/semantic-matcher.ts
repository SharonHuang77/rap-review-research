import type { ReviewFinding } from "../../models/finding.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";

/**
 * Scores the semantic similarity between a produced finding's title/description
 * and a ground-truth issue's, in [0, 1], or `undefined` when it declines to
 * score. Pluggable so a future LLM-backed matcher can replace the placeholder
 * without touching the evaluator.
 */
export interface ISemanticMatcher {
  score(
    finding: ReviewFinding,
    issue: GroundTruthIssue,
  ): number | undefined;
}

/**
 * Placeholder semantic matcher (RFC-13 scope: "semantic title/description
 * matching placeholder only; do not call LLM yet").
 *
 * It performs **no** semantic comparison and makes **no** LLM call — it always
 * returns `undefined`, so semantic signal never influences matching today. The
 * interface exists so a real matcher can be injected later.
 */
export class NoopSemanticMatcher implements ISemanticMatcher {
  public score(): number | undefined {
    return undefined;
  }
}
