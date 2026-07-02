import type { ExperimentMetrics } from "../../evaluation/models/experiment-metrics.ts";
import type { CostAnalysisView } from "../models/cost-analysis-view.ts";
import type { QualityAnalysisView } from "../models/quality-analysis-view.ts";
import type { MetricsView } from "../models/metrics-view.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

/**
 * Transforms Evaluation Engine {@link ExperimentMetrics} into a presentation
 * {@link MetricsView} — the Cost and Quality analyses with ready-to-render
 * charts (RFC-11 §6, Step 7). Nothing is recomputed; `totalTokens` is a display
 * sum only.
 */
export class MetricsViewBuilder
  implements IWorkbenchViewBuilder<ExperimentMetrics, MetricsView>
{
  public build(metrics: ExperimentMetrics): MetricsView {
    return {
      experimentId: metrics.experimentId,
      architecture: metrics.architecture,
      metrics,
      cost: buildCost(metrics),
      quality: buildQuality(metrics),
    };
  }
}

function buildCost(metrics: ExperimentMetrics): CostAnalysisView {
  const c = metrics.operationalCost;
  return {
    experimentId: metrics.experimentId,
    architecture: metrics.architecture,
    latencyMs: c.latencyMs,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    totalTokens: c.inputTokens + c.outputTokens,
    estimatedCostUsd: c.estimatedCostUsd,
    llmCalls: c.llmCalls,
    messageCount: c.messageCount,
    charts: [
      {
        title: "Token Usage",
        labels: ["input", "output"],
        values: [c.inputTokens, c.outputTokens],
      },
      {
        title: "Latency (ms)",
        labels: ["latency"],
        values: [c.latencyMs],
      },
      {
        title: "Estimated Cost (USD)",
        labels: ["cost"],
        values: [c.estimatedCostUsd],
      },
      {
        title: "Agent Activity",
        labels: ["llmCalls", "messageCount"],
        values: [c.llmCalls, c.messageCount],
      },
    ],
  };
}

function buildQuality(metrics: ExperimentMetrics): QualityAnalysisView {
  const q = metrics.reviewQuality;
  return {
    experimentId: metrics.experimentId,
    architecture: metrics.architecture,
    findingCount: q.findingCount,
    severityDistribution: {
      low: q.lowSeverityCount,
      medium: q.mediumSeverityCount,
      high: q.highSeverityCount,
      critical: q.criticalSeverityCount,
    },
    averageConfidence: q.averageConfidence,
    duplicateFindingCount: q.duplicateFindingCount,
    evidenceScore: metrics.researchEvidence.evidenceScore,
    charts: [
      {
        title: "Severity Distribution",
        labels: ["low", "medium", "high", "critical"],
        values: [
          q.lowSeverityCount,
          q.mediumSeverityCount,
          q.highSeverityCount,
          q.criticalSeverityCount,
        ],
      },
      {
        title: "Finding Count",
        labels: ["findings"],
        values: [q.findingCount],
      },
      {
        title: "Evidence & Confidence",
        labels: ["evidenceScore", "averageConfidence"],
        values: [metrics.researchEvidence.evidenceScore, q.averageConfidence],
      },
    ],
  };
}
