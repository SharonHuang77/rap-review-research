import type { ExperimentComparison } from "../../evaluation/models/experiment-comparison.ts";
import type { ExperimentMetrics } from "../../evaluation/models/experiment-metrics.ts";
import type { ComparisonChart } from "../models/comparison-chart.ts";
import type {
  ArchitectureComparisonRow,
  ArchitectureComparisonView,
} from "../models/architecture-comparison-view.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

export interface ComparisonBuildInput {
  readonly snapshotId: string;
  /** `null` / empty when no completed experiments exist for the snapshot. */
  readonly comparison: ExperimentComparison | null;
}

/**
 * Transforms an {@link ExperimentComparison} (already computed by the Evaluation
 * Engine) into a side-by-side {@link ArchitectureComparisonView} with charts
 * (RFC-11 §12). Presentation only: it copies metric values through and arranges
 * them into chart series — it never calculates a metric.
 */
export class ComparisonViewBuilder
  implements
    IWorkbenchViewBuilder<ComparisonBuildInput, ArchitectureComparisonView>
{
  public build(input: ComparisonBuildInput): ArchitectureComparisonView {
    const metrics = input.comparison?.architectures ?? [];
    const architectures: ArchitectureComparisonRow[] = metrics.map((m) =>
      toRow(m),
    );

    return {
      snapshotId: input.snapshotId,
      architectures,
      charts: buildCharts(architectures),
    };
  }
}

function toRow(m: ExperimentMetrics): ArchitectureComparisonRow {
  return {
    architecture: m.architecture,
    experimentId: m.experimentId,
    findingCount: m.reviewQuality.findingCount,
    severityDistribution: {
      low: m.reviewQuality.lowSeverityCount,
      medium: m.reviewQuality.mediumSeverityCount,
      high: m.reviewQuality.highSeverityCount,
      critical: m.reviewQuality.criticalSeverityCount,
    },
    averageConfidence: m.reviewQuality.averageConfidence,
    evidenceScore: m.researchEvidence.evidenceScore,
    latencyMs: m.operationalCost.latencyMs,
    inputTokens: m.operationalCost.inputTokens,
    outputTokens: m.operationalCost.outputTokens,
    estimatedCostUsd: m.operationalCost.estimatedCostUsd,
    llmCalls: m.operationalCost.llmCalls,
    messageCount: m.operationalCost.messageCount,
  };
}

/** One chart per compared dimension; labels are the architecture names. */
function buildCharts(rows: ArchitectureComparisonRow[]): ComparisonChart[] {
  const labels = rows.map((r) => r.architecture);
  const chart = (title: string, values: number[]): ComparisonChart => ({
    title,
    labels: [...labels],
    values,
  });

  return [
    chart(
      "Finding Count",
      rows.map((r) => r.findingCount),
    ),
    chart(
      "Evidence Score",
      rows.map((r) => r.evidenceScore),
    ),
    chart(
      "Average Confidence",
      rows.map((r) => r.averageConfidence),
    ),
    chart(
      "Latency (ms)",
      rows.map((r) => r.latencyMs),
    ),
    chart(
      "Estimated Cost (USD)",
      rows.map((r) => r.estimatedCostUsd),
    ),
    chart(
      "LLM Calls",
      rows.map((r) => r.llmCalls),
    ),
    chart(
      "Message Count",
      rows.map((r) => r.messageCount),
    ),
  ];
}
