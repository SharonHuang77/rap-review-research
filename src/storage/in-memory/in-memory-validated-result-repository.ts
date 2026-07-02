import type { StoredValidatedReviewResult } from "../stored-models.ts";
import type { ValidatedResultRepository } from "../validated-result-repository.ts";
import { DuplicateArtifactError } from "../storage-errors.ts";

/**
 * In-memory {@link ValidatedResultRepository}.
 *
 * Stores one immutable validated result per experiment, deep-cloned on write
 * and read.
 */
export class InMemoryValidatedResultRepository
  implements ValidatedResultRepository
{
  private readonly byExperimentId = new Map<
    string,
    StoredValidatedReviewResult
  >();

  public async save(result: StoredValidatedReviewResult): Promise<void> {
    if (this.byExperimentId.has(result.experimentId)) {
      throw new DuplicateArtifactError(
        `Validated result already stored for experiment "${result.experimentId}".`,
      );
    }
    this.byExperimentId.set(result.experimentId, structuredClone(result));
  }

  public async getByExperimentId(
    experimentId: string,
  ): Promise<StoredValidatedReviewResult | null> {
    const found = this.byExperimentId.get(experimentId);
    return found ? structuredClone(found) : null;
  }
}
