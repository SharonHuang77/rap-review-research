/**
 * Typed error hierarchy for the platform.
 *
 * The Development Guidelines require throwing typed exceptions rather than
 * generic `Error`s, so each failure category has its own class with a stable
 * `code` for programmatic handling and logging.
 */
export abstract class DomainError extends Error {
  /** Stable, machine-readable error code. */
  public abstract readonly code: string;

  public constructor(message: string) {
    super(message);
    // Preserve the concrete class name and fix the prototype chain so that
    // `instanceof` works after TypeScript downlevelling / type stripping.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A review architecture failed while executing its workflow. */
export class WorkflowError extends DomainError {
  public readonly code = "WORKFLOW_ERROR";
}

/** Model output failed schema validation. */
export class ValidationError extends DomainError {
  public readonly code = "VALIDATION_ERROR";
}

/** A persistence operation failed. */
export class StorageError extends DomainError {
  public readonly code = "STORAGE_ERROR";
}

/** An external provider (e.g. an LLM) failed. */
export class ProviderError extends DomainError {
  public readonly code = "PROVIDER_ERROR";
}

/** The requested review architecture is not registered. Not retryable. */
export class UnknownArchitectureError extends DomainError {
  public readonly code = "UNKNOWN_ARCHITECTURE";
}

/** The referenced PR Snapshot does not exist. Not retryable. */
export class SnapshotNotFoundError extends DomainError {
  public readonly code = "SNAPSHOT_NOT_FOUND";
}

/** The referenced experiment does not exist. */
export class ExperimentNotFoundError extends DomainError {
  public readonly code = "EXPERIMENT_NOT_FOUND";
}
