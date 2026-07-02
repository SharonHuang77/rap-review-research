import type { StoredExperimentResult } from "../../storage/stored-models.ts";
import type { ResearchEvidenceMetrics } from "../models/experiment-metrics.ts";

/**
 * Pluggable evidence-scoring strategy.
 *
 * The final research Evidence Score depends on signals (reviewer acceptance,
 * architecture agreement, later fix rate) that are not available yet, so the
 * algorithm is behind this interface. The Evaluation Engine depends only on
 * this interface; new scorers can be added without changing the engine.
 */
export interface IEvidenceScorer {
  calculate(result: StoredExperimentResult): ResearchEvidenceMetrics;
}
