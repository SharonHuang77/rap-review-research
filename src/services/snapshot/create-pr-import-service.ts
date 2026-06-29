import type { PRImportEngineDependencies } from "../../engines/pr-import/pr-import-engine.ts";
import type { SnapshotRepository } from "../../repositories/snapshot-repository.ts";
import type { RawDiffStorage } from "../../storage/raw-diff-storage.ts";
import type { IDiffParser } from "../../engines/pr-import/diff-parser.ts";
import type { SnapshotIdGenerator } from "../../shared/id.ts";
import type { Clock } from "../../shared/clock.ts";
import type { Logger } from "../../shared/logger.ts";

import { PRImportEngine } from "../../engines/pr-import/pr-import-engine.ts";
import { PRImportService } from "./pr-import-service.ts";
import { UnifiedDiffParser } from "../../engines/pr-import/diff-parser.ts";
import { InMemorySnapshotRepository } from "../../repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../../storage/in-memory/in-memory-raw-diff-storage.ts";
import { DefaultSnapshotIdGenerator } from "../../shared/id.ts";
import { SystemClock } from "../../shared/clock.ts";
import { NoopLogger } from "../../shared/logger.ts";

/**
 * Overrides for the composition root. Any collaborator can be replaced with a
 * test double or a future real implementation; omitted ones fall back to an
 * in-memory / default.
 */
export type PRImportServiceOverrides = Partial<PRImportEngineDependencies>;

/**
 * The fully-wired object graph produced by {@link createPRImportService}.
 */
export interface PRImportServiceContext {
  readonly service: PRImportService;
  readonly engine: PRImportEngine;
  readonly snapshots: SnapshotRepository;
  readonly rawDiffStorage: RawDiffStorage;
  readonly parser: IDiffParser;
  readonly idGenerator: SnapshotIdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Composition root: assemble a {@link PRImportService} backed by in-memory
 * snapshot storage and raw-diff storage, the unified-diff parser, and default
 * id/clock/logger. No GitHub, S3, or DynamoDB — exactly as required by RFC-02.
 */
export function createPRImportService(
  overrides: PRImportServiceOverrides = {},
): PRImportServiceContext {
  const snapshots = overrides.snapshots ?? new InMemorySnapshotRepository();
  const rawDiffStorage =
    overrides.rawDiffStorage ?? new InMemoryRawDiffStorage();
  const parser = overrides.parser ?? new UnifiedDiffParser();
  const idGenerator = overrides.idGenerator ?? new DefaultSnapshotIdGenerator();
  const clock = overrides.clock ?? new SystemClock();
  const logger = overrides.logger ?? new NoopLogger();

  const engine = new PRImportEngine({
    snapshots,
    rawDiffStorage,
    parser,
    idGenerator,
    clock,
    logger,
  });

  const service = new PRImportService(engine, logger);

  return {
    service,
    engine,
    snapshots,
    rawDiffStorage,
    parser,
    idGenerator,
    clock,
    logger,
  };
}
