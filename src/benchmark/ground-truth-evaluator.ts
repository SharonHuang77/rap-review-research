import type { ReviewFinding } from "../models/finding.ts";
import type { GroundTruthIssue } from "./models/ground-truth-issue.ts";
import type { BenchmarkRun } from "./models/benchmark-run.ts";
import type { BenchmarkResult } from "./models/benchmark-result.ts";

import { IssueMatcher } from "./matching/issue-matcher.ts";

export interface GroundTruthEvaluatorDependencies {
  /** The matcher deciding produced-finding ↔ ground-truth correspondence. */
  readonly matcher?: IssueMatcher;
}

/**
 * Scores one {@link BenchmarkRun} against its ground truth into a
 * {@link BenchmarkResult}: precision, recall, F1, localization accuracy, and the
 * true/false positive/negative counts.
 *
 * Deterministic and pure — no I/O, no LLM. Matching is a greedy one-to-one
 * assignment (each finding matches at most one issue and vice-versa) so a single
 * finding cannot inflate the true-positive count.
 */
export class GroundTruthEvaluator {
  private readonly matcher: IssueMatcher;

  public constructor(deps: GroundTruthEvaluatorDependencies = {}) {
    this.matcher = deps.matcher ?? new IssueMatcher();
  }

  public evaluate(run: BenchmarkRun): BenchmarkResult {
    const produced = run.producedFindings;
    const groundTruth = run.groundTruth;
    const producedCount = produced.length;
    const groundTruthCount = groundTruth.length;

    // True positives: strict match (file + line overlap, per matcher config).
    const truePositives = this.greedyMatchCount(
      produced,
      groundTruth,
      (f, g) => this.matcher.match(f, g).matched,
    );
    // Detected: file-level match only — the denominator for localization.
    const detected = this.greedyMatchCount(
      produced,
      groundTruth,
      (f, g) => this.matcher.match(f, g).fileMatch,
    );

    const falsePositives = producedCount - truePositives;
    const falseNegatives = groundTruthCount - truePositives;

    const precision = producedCount > 0 ? truePositives / producedCount : 0;
    const recall = groundTruthCount > 0 ? truePositives / groundTruthCount : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    const localizationAccuracy = detected > 0 ? truePositives / detected : 0;

    return {
      runId: run.runId,
      datasetId: run.datasetId,
      instanceId: run.instanceId,
      snapshotId: run.snapshotId,
      experimentId: run.experimentId,
      architecture: run.architecture,
      groundTruthCount,
      producedCount,
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
      localizationAccuracy,
    };
  }

  /**
   * Greedy one-to-one match count: iterate findings in order and pair each with
   * the first not-yet-paired ground-truth issue it satisfies `predicate` for.
   * Returns the number of paired issues (equals the number of paired findings).
   */
  private greedyMatchCount(
    findings: ReviewFinding[],
    groundTruth: GroundTruthIssue[],
    predicate: (finding: ReviewFinding, issue: GroundTruthIssue) => boolean,
  ): number {
    const usedIssue = new Array<boolean>(groundTruth.length).fill(false);
    let pairs = 0;
    for (const finding of findings) {
      for (let g = 0; g < groundTruth.length; g += 1) {
        if (!usedIssue[g] && predicate(finding, groundTruth[g] as GroundTruthIssue)) {
          usedIssue[g] = true;
          pairs += 1;
          break;
        }
      }
    }
    return pairs;
  }
}
