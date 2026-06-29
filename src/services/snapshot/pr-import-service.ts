import type {
  ImportManualDiffInput,
  ImportSnapshotResult,
} from "../../models/snapshot.ts";
import type { IPRImportEngine } from "../../engines/pr-import/pr-import-engine.ts";
import type { Logger } from "../../shared/logger.ts";

/**
 * Application-layer entry point for snapshot import use cases (RFC-02).
 *
 * Implements manual `.diff` upload only. GitHub PR URL import (`importGithubPR`
 * in the spec) is a future RFC and is intentionally not provided here.
 *
 * Responsibilities: coordinate the import use case on behalf of the API layer
 * and delegate to the PR Import Engine. Dependencies are injected.
 */
export interface IPRImportService {
  importManualDiff(input: ImportManualDiffInput): Promise<ImportSnapshotResult>;
}

export class PRImportService implements IPRImportService {
  private readonly engine: IPRImportEngine;
  private readonly logger: Logger;

  public constructor(engine: IPRImportEngine, logger: Logger) {
    this.engine = engine;
    this.logger = logger;
  }

  public async importManualDiff(
    input: ImportManualDiffInput,
  ): Promise<ImportSnapshotResult> {
    this.logger.info("Manual diff import requested", {
      source: input.source,
      title: input.title,
    });
    return this.engine.importManualDiff(input);
  }
}
