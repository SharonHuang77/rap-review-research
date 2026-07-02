import type { StoredExperimentResult } from "../../storage/stored-models.ts";
import type { ReviewFinding, SeverityLevel } from "../../models/finding.ts";
import type { ResearchEvidenceMetrics } from "../models/experiment-metrics.ts";
import type { IEvidenceScorer } from "./evidence-scorer.ts";

/**
 * Interim, deterministic evidence scorer (RFC-07).
 *
 * The score is a heuristic in [0, 1] combining three available signals —
 * severity weight, average confidence, and finding volume — NOT the final
 * research Evidence Score. The optional evidence signals (architecture
 * agreement, accepted-finding rate, later-fix rate) are left undefined until a
 * later scorer can compute them. Weights are constants here so the value is
 * derived from signals rather than hard-coded.
 */
export class HeuristicEvidenceScorer implements IEvidenceScorer {
  /** Relative weights (sum to 1). Documented heuristic — v1. */
  private static readonly SEVERITY_WEIGHT = 0.4;
  private static readonly CONFIDENCE_WEIGHT = 0.4;
  private static readonly VOLUME_WEIGHT = 0.2;
  /** Finding count at which the volume signal saturates to 1. */
  private static readonly VOLUME_SATURATION = 5;

  private static readonly SEVERITY_SCORE: Record<SeverityLevel, number> = {
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    critical: 1,
  };

  public calculate(result: StoredExperimentResult): ResearchEvidenceMetrics {
    const findings: ReviewFinding[] =
      result.validatedResult?.findings ?? result.findings;

    if (findings.length === 0) {
      return { evidenceScore: 0 };
    }

    const avgSeverity = mean(
      findings.map((f) => HeuristicEvidenceScorer.SEVERITY_SCORE[f.severity]),
    );
    const avgConfidence = mean(findings.map((f) => clamp01(f.confidence)));
    const volumeSignal = Math.min(
      findings.length / HeuristicEvidenceScorer.VOLUME_SATURATION,
      1,
    );

    const score =
      HeuristicEvidenceScorer.SEVERITY_WEIGHT * avgSeverity +
      HeuristicEvidenceScorer.CONFIDENCE_WEIGHT * avgConfidence +
      HeuristicEvidenceScorer.VOLUME_WEIGHT * volumeSignal;

    return { evidenceScore: clamp01(score) };
  }
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
