import type { StoredValidatedReviewResult } from "./stored-models.ts";

/**
 * Persistence port for validated review results (RFC-06).
 *
 * Validated results are immutable — saving a second result for the same
 * experiment must be rejected.
 */
export interface ValidatedResultRepository {
  /**
   * Persist a validated result.
   * @throws DuplicateArtifactError if one already exists for the experiment.
   */
  save(result: StoredValidatedReviewResult): Promise<void>;

  /** Look up the validated result for an experiment, or `null` if absent. */
  getByExperimentId(
    experimentId: string,
  ): Promise<StoredValidatedReviewResult | null>;
}
