import type { ILLMProvider } from "../../llm/provider/llm-provider.ts";
import type { ReviewFinding } from "../../models/finding.ts";
import type { GroundTruthIssue } from "../models/ground-truth-issue.ts";
import type { BenchmarkRun } from "../models/benchmark-run.ts";
import type { JudgeConfig } from "./judge-prompt.ts";
import type { SemanticScoreCache } from "./semantic-score-cache.ts";

import { buildJudgePrompt, parseJudgeScore } from "./judge-prompt.ts";

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "");
}

/**
 * A pair is worth judging only when the finding is in the ground-truth issue's
 * file but does NOT overlap its line span — the only case where a semantic score
 * can change `matched` (overlap already matches; a different file never matches).
 */
function isCandidatePair(finding: ReviewFinding, issue: GroundTruthIssue): boolean {
  const fileMatch = normalizePath(finding.file) === normalizePath(issue.file);
  const lineOverlap = finding.line >= issue.lineStart && finding.line <= issue.lineEnd;
  return fileMatch && !lineOverlap;
}

/**
 * Async pre-pass (A2): fills a {@link SemanticScoreCache} with judge scores for
 * candidate pairs, so the synchronous evaluator can read them later. Judges each
 * uncached candidate pair exactly once. Deterministic given the provider.
 */
export class JudgeScorePrecomputer {
  private readonly provider: ILLMProvider;
  private readonly config: JudgeConfig;

  public constructor(provider: ILLMProvider, config: JudgeConfig) {
    this.provider = provider;
    this.config = config;
  }

  public async precompute(
    runs: BenchmarkRun[],
    cache: SemanticScoreCache,
  ): Promise<void> {
    for (const run of runs) {
      for (const finding of run.producedFindings) {
        for (const issue of run.groundTruth) {
          if (!isCandidatePair(finding, issue) || cache.has(finding, issue)) {
            continue;
          }
          const response = await this.provider.review(
            buildJudgePrompt(finding, issue, this.config),
          );
          const score = parseJudgeScore(response.text);
          if (score !== undefined) {
            cache.set(finding, issue, score);
          }
        }
      }
    }
  }
}
