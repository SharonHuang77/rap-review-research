import type { Experiment } from "../../models/experiment.ts";
import type { ExperimentSummaryView } from "../models/experiment-summary-view.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

/**
 * Projects an {@link Experiment} into an {@link ExperimentSummaryView} row for
 * the Experiment List. Additive builder (RFC-11 Step 4 allows more builders than
 * the four headline examples); keeps {@link WorkbenchService} free of shaping
 * logic.
 */
export class ExperimentSummaryViewBuilder
  implements IWorkbenchViewBuilder<Experiment, ExperimentSummaryView>
{
  public build(experiment: Experiment): ExperimentSummaryView {
    return {
      experimentId: experiment.experimentId,
      snapshotId: experiment.snapshotId,
      architecture: experiment.architecture,
      status: experiment.status,
      promptVersion: experiment.promptVersion,
      modelVersion: experiment.modelVersion,
      createdAt: experiment.createdAt,
    };
  }
}
