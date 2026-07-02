import type { Experiment } from "../models/experiment.ts";
import type { PRSnapshot } from "../models/snapshot.ts";
import type { ConversationHistory } from "../architectures/shared/conversation-history.ts";
import type { ExportRecord } from "./models/export-history-view.ts";

/**
 * Read-only ports the Workbench depends on. The Workbench is a read/aggregation
 * layer, so it defines exactly the reads it needs and never depends on a
 * concrete database — mirroring the repository-port pattern used across the
 * platform. Composition roots adapt existing storage to these ports.
 *
 * They are intentionally separate from the RFC-01/02 write-side repositories:
 * the Workbench requires listing/browsing capabilities (e.g. `list()`) that the
 * execution-side repositories do not expose, and keeping them separate avoids
 * modifying earlier RFCs.
 */

/** Source of experiments for browsing and detail lookups. */
export interface ExperimentReadPort {
  /** All known experiments, in a stable order (typically creation order). */
  list(): Promise<Experiment[]>;
  /** Look up one experiment by id, or `null` if absent. */
  getById(experimentId: string): Promise<Experiment | null>;
}

/**
 * Source of PR snapshots. The RFC-02 {@link SnapshotRepository} structurally
 * satisfies this port, so it can be passed directly.
 */
export interface SnapshotReadPort {
  getById(snapshotId: string): Promise<PRSnapshot | null>;
}

/**
 * Source of conversation histories for replay. Populated by whoever captures a
 * multi-agent run's {@link ConversationHistory} artifact. Returns `null` when an
 * experiment produced no conversation (e.g. Agentless).
 */
export interface ConversationHistoryReadPort {
  getByExperimentId(experimentId: string): Promise<ConversationHistory | null>;
}

/** Source of previously generated export metadata (RFC-10 results). */
export interface ExportHistoryReadPort {
  /** All recorded exports, most-recently-recorded last. */
  list(): Promise<ExportRecord[]>;
}
