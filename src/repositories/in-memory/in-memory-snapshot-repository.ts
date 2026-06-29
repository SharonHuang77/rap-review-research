import type { PRSnapshot } from "../../models/snapshot.ts";
import type { SnapshotRepository } from "../snapshot-repository.ts";

/**
 * In-memory {@link SnapshotRepository} for development and unit tests.
 *
 * Stores immutable snapshots keyed by `snapshotId`. Returned snapshots are
 * shallow copies so callers cannot mutate stored state.
 */
export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly bySnapshotId = new Map<string, PRSnapshot>();

  public async findById(snapshotId: string): Promise<PRSnapshot | null> {
    const found = this.bySnapshotId.get(snapshotId);
    return found ? { ...found } : null;
  }

  public async save(snapshot: PRSnapshot): Promise<void> {
    this.bySnapshotId.set(snapshot.snapshotId, { ...snapshot });
  }
}
