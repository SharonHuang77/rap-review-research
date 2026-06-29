import type { PRSnapshot } from "../models/snapshot.ts";

/**
 * Persistence port for immutable {@link PRSnapshot}s (RFC-02).
 *
 * Business logic depends on this interface, never on a concrete database.
 * Snapshots are written once by the PR Import Engine and only ever read
 * afterwards (the Experiment Engine reads them via {@link getById}).
 */
export interface SnapshotRepository {
  /**
   * Find an existing snapshot by its deterministic idempotency key, or `null`.
   * Used to avoid importing the same PR/commit twice.
   */
  findByIdempotencyKey(key: string): Promise<PRSnapshot | null>;

  /** Persist a newly created snapshot. */
  create(snapshot: PRSnapshot): Promise<void>;

  /** Look up a snapshot by id, or `null` if absent. */
  getById(snapshotId: string): Promise<PRSnapshot | null>;
}
