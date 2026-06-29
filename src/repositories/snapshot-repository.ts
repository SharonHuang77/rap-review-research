import type { PRSnapshot } from "../models/snapshot.ts";

/**
 * Read port for immutable {@link PRSnapshot}s.
 *
 * Snapshots are produced by the PR Import Engine (a future RFC); the Experiment
 * Engine only reads them. `save` exists so snapshots can be seeded in tests and
 * local development until the import engine lands.
 */
export interface SnapshotRepository {
  /** Look up a snapshot by id, or `null` if absent. */
  findById(snapshotId: string): Promise<PRSnapshot | null>;

  /** Persist a snapshot (seeding hook; snapshots are immutable once stored). */
  save(snapshot: PRSnapshot): Promise<void>;
}
