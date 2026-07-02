import type { StoredReviewFinding } from "../stored-models.ts";
import type { FindingRepository } from "../finding-repository.ts";
import { DuplicateArtifactError } from "../storage-errors.ts";

/**
 * In-memory {@link FindingRepository}.
 *
 * Stores findings grouped by experiment, immutably (a second save for the same
 * experiment is rejected). Values are deep-cloned on write and read.
 */
export class InMemoryFindingRepository implements FindingRepository {
  private readonly byExperimentId = new Map<string, StoredReviewFinding[]>();

  public async saveMany(findings: StoredReviewFinding[]): Promise<void> {
    const experimentIds = new Set(findings.map((f) => f.experimentId));
    for (const experimentId of experimentIds) {
      if (this.byExperimentId.has(experimentId)) {
        throw new DuplicateArtifactError(
          `Findings already stored for experiment "${experimentId}".`,
        );
      }
    }
    for (const experimentId of experimentIds) {
      const forExperiment = findings.filter(
        (f) => f.experimentId === experimentId,
      );
      this.byExperimentId.set(experimentId, structuredClone(forExperiment));
    }
  }

  public async getByExperimentId(
    experimentId: string,
  ): Promise<StoredReviewFinding[]> {
    const found = this.byExperimentId.get(experimentId);
    return found ? structuredClone(found) : [];
  }
}
