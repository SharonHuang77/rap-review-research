import type { StoredRawReviewResult } from "./stored-models.ts";

/**
 * Persistence port for raw review results (RFC-06).
 *
 * Raw results are immutable — saving a second result for the same experiment
 * must be rejected.
 */
export interface RawResultRepository {
  /**
   * Persist a raw result.
   * @throws DuplicateArtifactError if one already exists for the experiment.
   */
  save(rawResult: StoredRawReviewResult): Promise<void>;

  /** Look up the raw result for an experiment, or `null` if absent. */
  getByExperimentId(
    experimentId: string,
  ): Promise<StoredRawReviewResult | null>;
}
