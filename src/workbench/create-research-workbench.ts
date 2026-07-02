import type { IEvaluationEngine } from "../evaluation/index.ts";
import type { IStorageEngine } from "../storage/index.ts";
import type { Logger } from "../shared/logger.ts";
import type { SnapshotReadPort } from "./ports.ts";

import {
  StorageEngine,
  InMemoryRawResultRepository,
  InMemoryValidatedResultRepository,
  InMemoryFindingRepository,
} from "../storage/index.ts";
import { EvaluationEngine } from "../evaluation/index.ts";
import { NoopLogger } from "../shared/logger.ts";

import { WorkbenchService } from "./workbench-service.ts";
import { ReplayService } from "./replay-service.ts";
import { ComparisonService } from "./comparison-service.ts";
import { MetricsService } from "./metrics-service.ts";
import { ExportHistoryService } from "./export-history-service.ts";
import { InMemoryExperimentReadStore } from "./in-memory/in-memory-experiment-read-store.ts";
import { InMemoryConversationStore } from "./in-memory/in-memory-conversation-store.ts";
import { InMemoryExportHistoryStore } from "./in-memory/in-memory-export-history-store.ts";

/**
 * Shared services the Workbench reads from. Provide these to point the Workbench
 * at the same Storage/Evaluation/Snapshot instances used by the experiment
 * pipeline; anything omitted falls back to an in-memory / default instance.
 */
export interface WorkbenchOverrides {
  readonly storage?: IStorageEngine;
  readonly evaluation?: IEvaluationEngine;
  readonly snapshots?: SnapshotReadPort;
  readonly logger?: Logger;
}

/**
 * The fully-wired Workbench object graph. The three read stores are returned so
 * callers (and tests) can seed experiments, conversations, and export history —
 * exactly the artifacts a real deployment would populate as experiments run and
 * exports are produced.
 */
export interface WorkbenchContext {
  readonly workbench: WorkbenchService;
  readonly experiments: InMemoryExperimentReadStore;
  readonly conversations: InMemoryConversationStore;
  readonly exportHistory: InMemoryExportHistoryStore;
  readonly snapshots: SnapshotReadPort;
  readonly storage: IStorageEngine;
  readonly evaluation: IEvaluationEngine;
}

/** In-memory snapshot read port used when no snapshot source is provided. */
class EmptySnapshotReadPort implements SnapshotReadPort {
  public async getById(): Promise<null> {
    return null;
  }
}

/**
 * Composition root for the Research Workbench (RFC-11).
 *
 * Wires the focused sub-services and the orchestrating {@link WorkbenchService}
 * over in-memory read stores, reusing the platform's Storage and Evaluation
 * engines. No database, AWS, or LLM provider is involved — the Workbench is
 * read-only over already-generated artifacts.
 */
export function createResearchWorkbench(
  overrides: WorkbenchOverrides = {},
): WorkbenchContext {
  const logger = overrides.logger ?? new NoopLogger();
  const storage =
    overrides.storage ??
    new StorageEngine({
      rawResults: new InMemoryRawResultRepository(),
      validatedResults: new InMemoryValidatedResultRepository(),
      findings: new InMemoryFindingRepository(),
      logger,
    });
  const evaluation = overrides.evaluation ?? new EvaluationEngine({ logger });
  const snapshots = overrides.snapshots ?? new EmptySnapshotReadPort();

  const experiments = new InMemoryExperimentReadStore();
  const conversations = new InMemoryConversationStore();
  const exportHistory = new InMemoryExportHistoryStore();

  const replayService = new ReplayService({ experiments, conversations });
  const comparisonService = new ComparisonService({
    experiments,
    storage,
    evaluation,
  });
  const metricsService = new MetricsService({ storage, evaluation });
  const exportHistoryService = new ExportHistoryService({
    history: exportHistory,
  });

  const workbench = new WorkbenchService({
    experiments,
    snapshots,
    storage,
    evaluation,
    replayService,
    comparisonService,
    metricsService,
    exportHistoryService,
    logger,
  });

  return {
    workbench,
    experiments,
    conversations,
    exportHistory,
    snapshots,
    storage,
    evaluation,
  };
}
