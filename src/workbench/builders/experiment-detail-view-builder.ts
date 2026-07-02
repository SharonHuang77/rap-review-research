import type { PRSnapshot } from "../../models/snapshot.ts";
import type { StoredExperimentResult } from "../../storage/stored-models.ts";
import type { ExperimentMetrics } from "../../evaluation/models/experiment-metrics.ts";
import type { ExperimentSummaryView } from "../models/experiment-summary-view.ts";
import type {
  PRSummaryView,
  ExperimentDetailView,
} from "../models/experiment-detail-view.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

export interface DetailBuildInput {
  readonly summary: ExperimentSummaryView;
  readonly snapshot: PRSnapshot | null;
  readonly stored: StoredExperimentResult | null;
  readonly metrics: ExperimentMetrics | null;
}

/**
 * Assembles the {@link ExperimentDetailView} from already-loaded artifacts: the
 * summary, the PR snapshot, the stored raw/validated results, and the evaluation
 * metrics. Additive builder; a pure projection with no I/O and no calculation.
 */
export class ExperimentDetailViewBuilder
  implements IWorkbenchViewBuilder<DetailBuildInput, ExperimentDetailView>
{
  public build(input: DetailBuildInput): ExperimentDetailView {
    const { stored } = input;
    const validated = stored?.validatedResult ?? null;
    const raw = stored?.rawResult ?? null;

    return {
      summary: input.summary,
      pr: input.snapshot ? toPRSummary(input.snapshot) : null,
      reviewSummary: validated?.summary ?? raw?.summary ?? null,
      findings: validated?.findings ?? [],
      rawOutput: raw?.rawOutput ?? null,
      metrics: input.metrics,
    };
  }
}

function toPRSummary(snapshot: PRSnapshot): PRSummaryView {
  return {
    snapshotId: snapshot.snapshotId,
    title: snapshot.title,
    description: snapshot.description,
    source: snapshot.source,
    category: snapshot.category,
    complexity: snapshot.complexity,
    changedFileCount: snapshot.changedFiles.length,
    totalChangedLines: snapshot.totalChangedLines,
  };
}
