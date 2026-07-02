import type { ReviewArchitecture } from "../../models/experiment.ts";
import type { ExperimentMetrics } from "./experiment-metrics.ts";

/**
 * A flat, export-ready record for one experiment (one row per experiment).
 *
 * The Evaluation Engine only prepares these rows — writing CSV/JSON files
 * belongs to a future Export Service.
 */
export interface EvaluationExportRow {
  readonly experimentId: string;
  readonly architecture: ReviewArchitecture;
  readonly findingCount: number;
  readonly highSeverityCount: number;
  readonly criticalSeverityCount: number;
  readonly averageConfidence: number;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly llmCalls: number;
  readonly messageCount: number;
  readonly evidenceScore: number;
}

/**
 * Flatten {@link ExperimentMetrics} into a single export row. Pure and
 * deterministic; does not mutate the input.
 */
export function toEvaluationExportRow(
  metrics: ExperimentMetrics,
): EvaluationExportRow {
  return {
    experimentId: metrics.experimentId,
    architecture: metrics.architecture,
    findingCount: metrics.reviewQuality.findingCount,
    highSeverityCount: metrics.reviewQuality.highSeverityCount,
    criticalSeverityCount: metrics.reviewQuality.criticalSeverityCount,
    averageConfidence: metrics.reviewQuality.averageConfidence,
    latencyMs: metrics.operationalCost.latencyMs,
    inputTokens: metrics.operationalCost.inputTokens,
    outputTokens: metrics.operationalCost.outputTokens,
    estimatedCostUsd: metrics.operationalCost.estimatedCostUsd,
    llmCalls: metrics.operationalCost.llmCalls,
    messageCount: metrics.operationalCost.messageCount,
    evidenceScore: metrics.researchEvidence.evidenceScore,
  };
}
