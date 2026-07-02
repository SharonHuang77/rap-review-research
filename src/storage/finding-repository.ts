import type { StoredReviewFinding } from "./stored-models.ts";

/**
 * Persistence port for review findings (RFC-06).
 *
 * Findings are stored separately from their parent result and are immutable —
 * saving findings a second time for the same experiment must be rejected.
 */
export interface FindingRepository {
  /**
   * Persist all findings for an experiment.
   * @throws DuplicateArtifactError if findings already exist for the experiment.
   */
  saveMany(findings: StoredReviewFinding[]): Promise<void>;

  /** Return the findings for an experiment (empty array if none). */
  getByExperimentId(experimentId: string): Promise<StoredReviewFinding[]>;
}
