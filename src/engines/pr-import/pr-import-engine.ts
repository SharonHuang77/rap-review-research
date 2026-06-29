import type {
  PRSnapshot,
  ImportManualDiffInput,
  ImportSnapshotResult,
  PRCategory,
  PRComplexity,
} from "../../models/snapshot.ts";
import type { SnapshotRepository } from "../../repositories/snapshot-repository.ts";
import type { RawDiffStorage } from "../../storage/raw-diff-storage.ts";
import type { Clock } from "../../shared/clock.ts";
import type { SnapshotIdGenerator } from "../../shared/id.ts";
import type { Logger } from "../../shared/logger.ts";
import type { IDiffParser, ParsedDiff } from "./diff-parser.ts";

import { DiffParseError, ImportError } from "../../shared/errors.ts";
import { classifyCategory, classifyComplexity } from "./classification.ts";

/**
 * Public contract of the PR Import Engine (RFC-02, manual import only).
 */
export interface IPRImportEngine {
  importManualDiff(input: ImportManualDiffInput): Promise<ImportSnapshotResult>;
}

/**
 * Collaborators required by the {@link PRImportEngine}, all injected.
 */
export interface PRImportEngineDependencies {
  readonly snapshots: SnapshotRepository;
  readonly rawDiffStorage: RawDiffStorage;
  readonly parser: IDiffParser;
  readonly idGenerator: SnapshotIdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Converts an uploaded unified diff into an immutable {@link PRSnapshot}.
 *
 * Responsibilities (RFC-02 manual path): validate the request, store the raw
 * diff, parse changed files and line ranges, classify category and complexity,
 * and persist the snapshot.
 *
 * Non-responsibilities: GitHub access, S3/DynamoDB, LLM calls, review logic.
 * Those belong to other modules / future RFCs.
 */
export class PRImportEngine implements IPRImportEngine {
  private readonly deps: PRImportEngineDependencies;

  public constructor(deps: PRImportEngineDependencies) {
    this.deps = deps;
  }

  public async importManualDiff(
    input: ImportManualDiffInput,
  ): Promise<ImportSnapshotResult> {
    this.assertValidRequest(input);

    const parsed = this.deps.parser.parse(input.rawDiff);
    if (parsed.files.length === 0) {
      throw new DiffParseError(
        "The uploaded diff did not contain any changed files.",
      );
    }

    const snapshotId = this.deps.idGenerator.nextSnapshotId();
    const rawDiffS3Key = await this.deps.rawDiffStorage.saveRawDiff(
      snapshotId,
      input.rawDiff,
    );

    const snapshot = this.buildSnapshot(input, snapshotId, rawDiffS3Key, parsed);
    await this.deps.snapshots.create(snapshot);

    this.deps.logger.info("Imported manual diff snapshot", {
      snapshotId,
      source: input.source,
      category: snapshot.category,
      complexity: snapshot.complexity,
      changedFiles: snapshot.changedFiles.length,
    });

    return { snapshotId, reusedExisting: false };
  }

  private assertValidRequest(input: ImportManualDiffInput): void {
    if (!input.title || input.title.trim().length === 0) {
      throw new ImportError("A snapshot title is required.");
    }
    if (!input.rawDiff || input.rawDiff.trim().length === 0) {
      throw new ImportError("A raw diff is required.");
    }
  }

  private buildSnapshot(
    input: ImportManualDiffInput,
    snapshotId: string,
    rawDiffS3Key: string,
    parsed: ParsedDiff,
  ): PRSnapshot {
    const category: PRCategory =
      input.category ?? classifyCategory(parsed.files);
    const complexity: PRComplexity =
      input.complexity ?? classifyComplexity(parsed.totalChangedLines);

    return {
      snapshotId,
      source: input.source,
      title: input.title,
      description: input.description,
      rawDiffS3Key,
      changedFiles: parsed.files,
      totalChangedLines: parsed.totalChangedLines,
      category,
      complexity,
      importedAt: this.deps.clock.nowIso(),
    };
  }
}
