import { DomainError } from "../shared/errors.ts";

/**
 * Base error for the Research Workbench (RFC-11). `code` is typed as `string`
 * so subclasses can supply their own stable code.
 */
export class WorkbenchError extends DomainError {
  public readonly code: string = "WORKBENCH_ERROR";
}

/**
 * A view could not be built because a required artifact was missing (e.g. an
 * experiment has no validated result to present metrics for). Distinct from
 * {@link ExperimentNotFoundError}, which means the experiment itself is unknown.
 */
export class WorkbenchArtifactUnavailableError extends WorkbenchError {
  public override readonly code = "WORKBENCH_ARTIFACT_UNAVAILABLE";
}
