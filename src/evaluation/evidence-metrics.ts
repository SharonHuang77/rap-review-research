import type { StoredExperimentResult } from "../storage/stored-models.ts";
import type { ResearchEvidenceMetrics } from "./models/experiment-metrics.ts";
import type { IEvidenceScorer } from "./scorers/evidence-scorer.ts";

/**
 * Computes {@link ResearchEvidenceMetrics} by delegating to a pluggable
 * {@link IEvidenceScorer}. Holds no scoring logic of its own, so the scoring
 * strategy can evolve without touching the Evaluation Engine.
 */
export class EvidenceMetricsCalculator {
  private readonly scorer: IEvidenceScorer;

  public constructor(scorer: IEvidenceScorer) {
    this.scorer = scorer;
  }

  public calculate(result: StoredExperimentResult): ResearchEvidenceMetrics {
    return this.scorer.calculate(result);
  }
}
