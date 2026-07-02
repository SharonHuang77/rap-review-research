import type { ReviewArchitecture } from "../../models/experiment.ts";

/**
 * Review-quality metrics derived from a completed experiment's findings.
 *
 * `localizationAccuracy` is only meaningful in synthetic-benchmark mode (known
 * defect locations); it is left undefined for real pull requests.
 */
export interface ReviewQualityMetrics {
  readonly findingCount: number;
  readonly lowSeverityCount: number;
  readonly mediumSeverityCount: number;
  readonly highSeverityCount: number;
  readonly criticalSeverityCount: number;
  readonly averageConfidence: number;
  readonly duplicateFindingCount: number;
  readonly localizationAccuracy?: number;
}

/**
 * Operational-cost metrics. These are collected directly from the experiment
 * execution — the calculator copies them through without modification.
 */
export interface OperationalCostMetrics {
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly llmCalls: number;
  readonly messageCount: number;
}

/**
 * Research-evidence metrics. Only `evidenceScore` is available today; the
 * optional signals are populated by future scorers (after more architectures
 * and real-world data exist). Missing optional values must never fail evaluation.
 */
export interface ResearchEvidenceMetrics {
  readonly evidenceScore: number;
  readonly architectureAgreement?: number;
  readonly acceptedFindingRate?: number;
  readonly laterFixRate?: number;
}

/**
 * The primary output of the Evaluation Engine for a single experiment.
 */
export interface ExperimentMetrics {
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;
  readonly reviewQuality: ReviewQualityMetrics;
  readonly operationalCost: OperationalCostMetrics;
  readonly researchEvidence: ResearchEvidenceMetrics;
}
