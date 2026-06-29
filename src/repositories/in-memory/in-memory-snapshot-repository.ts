import type { PRSnapshot } from "../../models/snapshot.ts";
import type { SnapshotRepository } from "../snapshot-repository.ts";
import { StorageError } from "../../shared/errors.ts";
import { buildSnapshotIdempotencyKey } from "../../shared/id.ts";

/**
 * In-memory {@link SnapshotRepository} for development and unit tests.
 *
 * Stores immutable snapshots keyed by `snapshotId`. Returned snapshots are
 * shallow copies so callers cannot mutate stored state. Snapshots whose origin
 * is fully known are additionally resolvable by their idempotency key; manual
 * uploads (no repo/PR/commit) have no key and never match.
 */
export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly bySnapshotId = new Map<string, PRSnapshot>();

  public async findByIdempotencyKey(
    key: string,
  ): Promise<PRSnapshot | null> {
    for (const snapshot of this.bySnapshotId.values()) {
      if (buildSnapshotIdempotencyKey(snapshot) === key) {
        return { ...snapshot };
      }
    }
    return null;
  }

  public async create(snapshot: PRSnapshot): Promise<void> {
    if (this.bySnapshotId.has(snapshot.snapshotId)) {
      throw new StorageError(
        `Snapshot "${snapshot.snapshotId}" already exists.`,
      );
    }
    this.bySnapshotId.set(snapshot.snapshotId, { ...snapshot });
  }

  public async getById(snapshotId: string): Promise<PRSnapshot | null> {
    const found = this.bySnapshotId.get(snapshotId);
    return found ? { ...found } : null;
  }
}
