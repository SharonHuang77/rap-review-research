import type {
  ReviewArchitecture,
  ExperimentStatus,
} from "../../models/experiment.ts";

/**
 * A row of the Experiment List page (RFC-11 §6). Carries exactly the columns
 * the list renders; a pure projection of an {@link Experiment}.
 */
export interface ExperimentSummaryView {
  readonly experimentId: string;
  readonly snapshotId: string;
  readonly architecture: ReviewArchitecture;
  readonly status: ExperimentStatus;
  readonly promptVersion: string;
  readonly modelVersion: string;
  readonly createdAt: string;
}
