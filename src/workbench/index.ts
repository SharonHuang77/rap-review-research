/**
 * Public barrel for the Research Workbench (RFC-11).
 *
 * A read-only backend that aggregates Storage, Evaluation, and Export artifacts
 * into presentation-ready view models. No UI, no experiment execution, no LLM
 * calls, no metric calculation.
 */

// Orchestrator + interface.
export type {
  IResearchWorkbench,
  WorkbenchServiceDependencies,
} from "./workbench-service.ts";
export { WorkbenchService } from "./workbench-service.ts";

// Composition root.
export type {
  WorkbenchOverrides,
  WorkbenchContext,
} from "./create-research-workbench.ts";
export { createResearchWorkbench } from "./create-research-workbench.ts";

// Focused services.
export type { ReplayServiceDependencies } from "./replay-service.ts";
export { ReplayService } from "./replay-service.ts";
export type { ComparisonServiceDependencies } from "./comparison-service.ts";
export { ComparisonService } from "./comparison-service.ts";
export type { MetricsServiceDependencies } from "./metrics-service.ts";
export { MetricsService } from "./metrics-service.ts";
export type { ExportHistoryServiceDependencies } from "./export-history-service.ts";
export { ExportHistoryService } from "./export-history-service.ts";

// Read ports.
export type {
  ExperimentReadPort,
  SnapshotReadPort,
  ConversationHistoryReadPort,
  ExportHistoryReadPort,
} from "./ports.ts";

// In-memory read stores.
export { InMemoryExperimentReadStore } from "./in-memory/in-memory-experiment-read-store.ts";
export { InMemoryConversationStore } from "./in-memory/in-memory-conversation-store.ts";
export { InMemoryExportHistoryStore } from "./in-memory/in-memory-export-history-store.ts";

// View builders.
export type { IWorkbenchViewBuilder } from "./builders/workbench-view-builder.ts";
export type { ReplayBuildInput } from "./builders/replay-view-builder.ts";
export { ReplayViewBuilder } from "./builders/replay-view-builder.ts";
export type { ComparisonBuildInput } from "./builders/comparison-view-builder.ts";
export { ComparisonViewBuilder } from "./builders/comparison-view-builder.ts";
export { MetricsViewBuilder } from "./builders/metrics-view-builder.ts";
export { ExportHistoryViewBuilder } from "./builders/export-history-view-builder.ts";
export { ExperimentSummaryViewBuilder } from "./builders/experiment-summary-view-builder.ts";
export type { DetailBuildInput } from "./builders/experiment-detail-view-builder.ts";
export { ExperimentDetailViewBuilder } from "./builders/experiment-detail-view-builder.ts";

// Presentation models.
export type { ReplayStep, ReplayView } from "./models/replay-step.ts";
export type { ComparisonChart } from "./models/comparison-chart.ts";
export type { SeverityDistribution } from "./models/severity-distribution.ts";
export type { ExperimentSummaryView } from "./models/experiment-summary-view.ts";
export type {
  PRSummaryView,
  ExperimentDetailView,
} from "./models/experiment-detail-view.ts";
export type {
  ArchitectureComparisonRow,
  ArchitectureComparisonView,
} from "./models/architecture-comparison-view.ts";
export type { CostAnalysisView } from "./models/cost-analysis-view.ts";
export type { QualityAnalysisView } from "./models/quality-analysis-view.ts";
export type { MetricsView } from "./models/metrics-view.ts";
export type {
  ExportRecord,
  ExportHistoryItemView,
  ExportHistoryView,
} from "./models/export-history-view.ts";

// Errors.
export {
  WorkbenchError,
  WorkbenchArtifactUnavailableError,
} from "./workbench-errors.ts";
