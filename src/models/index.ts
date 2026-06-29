/**
 * Public barrel for the domain model layer.
 *
 * Models contain domain types and business rules but no persistence or
 * infrastructure logic.
 */
export type {
  ExperimentStatus,
  ReviewArchitecture,
  Experiment,
  RunExperimentInput,
  RunExperimentResult,
  ExperimentCompletionSummary,
} from "./experiment.ts";

export type {
  PRSnapshot,
  ChangedFile,
  ChangedLineRange,
  PRSource,
  ManualDiffSource,
  PRCategory,
  PRComplexity,
  FileChangeType,
  LineChangeType,
  ImportManualDiffInput,
  ImportSnapshotResult,
} from "./snapshot.ts";

export type {
  SeverityLevel,
  RiskLevel,
  ReviewFinding,
} from "./finding.ts";

export type {
  ReviewExecutionInput,
  RawReviewResult,
  ValidatedReviewResult,
} from "./review-result.ts";
