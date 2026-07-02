import type { StoredRawReviewResult } from "../stored-models.ts";
import type { RawResultRepository } from "../raw-result-repository.ts";
import { DuplicateArtifactError } from "../storage-errors.ts";

/**
 * In-memory {@link RawResultRepository}.
 *
 * Stores one immutable raw result per experiment. Values are deep-cloned on
 * write and read so stored artifacts are never affected by later caller
 * mutations, and vice versa.
 */
export class InMemoryRawResultRepository implements RawResultRepository {
  private readonly byExperimentId = new Map<string, StoredRawReviewResult>();

  public async save(rawResult: StoredRawReviewResult): Promise<void> {
    if (this.byExperimentId.has(rawResult.experimentId)) {
      throw new DuplicateArtifactError(
        `Raw result already stored for experiment "${rawResult.experimentId}".`,
      );
    }
    this.byExperimentId.set(rawResult.experimentId, structuredClone(rawResult));
  }

  public async getByExperimentId(
    experimentId: string,
  ): Promise<StoredRawReviewResult | null> {
    const found = this.byExperimentId.get(experimentId);
    return found ? structuredClone(found) : null;
  }
}
