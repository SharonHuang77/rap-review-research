import type {
  Experiment,
  ExperimentStatus,
  ExperimentCompletionSummary,
} from "../models/experiment.ts";

/**
 * Persistence port for {@link Experiment} aggregates.
 *
 * Business logic depends on this interface, never on a concrete database
 * (Principle: business logic must never touch storage directly). The methods
 * mirror those required by the Experiment Engine specification, with the
 * addition of `findById`, which the public engine API (`getStatus` / `retry`)
 * requires in order to look an experiment up by its identifier.
 */
export interface ExperimentRepository {
  /** Look up an experiment by its identifier, or `null` if absent. */
  findById(experimentId: string): Promise<Experiment | null>;

  /**
   * Look up the most recent experiment matching a deterministic idempotency
   * key, or `null` if none exists.
   */
  findByIdempotencyKey(key: string): Promise<Experiment | null>;

  /** Persist a newly created experiment record. */
  create(experiment: Experiment): Promise<void>;

  /** Transition an experiment to a new lifecycle status. */
  updateStatus(experimentId: string, status: ExperimentStatus): Promise<void>;

  /** Mark an experiment as failed and record the error message. */
  markFailed(experimentId: string, errorMessage: string): Promise<void>;

  /** Mark an experiment as completed and apply its execution summary. */
  markCompleted(
    experimentId: string,
    summary: ExperimentCompletionSummary,
  ): Promise<void>;
}
