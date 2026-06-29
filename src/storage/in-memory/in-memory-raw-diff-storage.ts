import type { RawDiffStorage } from "../raw-diff-storage.ts";
import { StorageError } from "../../shared/errors.ts";

/**
 * In-memory {@link RawDiffStorage} for development and unit tests.
 *
 * Stores raw diffs in a map keyed by a logical storage key shaped like an S3
 * key (`raw-diff/<snapshotId>.diff`) so the rest of the system is agnostic to
 * the backing store.
 */
export class InMemoryRawDiffStorage implements RawDiffStorage {
  private readonly byKey = new Map<string, string>();

  public async saveRawDiff(
    snapshotId: string,
    rawDiff: string,
  ): Promise<string> {
    const key = `raw-diff/${snapshotId}.diff`;
    this.byKey.set(key, rawDiff);
    return key;
  }

  public async getRawDiff(key: string): Promise<string> {
    const diff = this.byKey.get(key);
    if (diff === undefined) {
      throw new StorageError(`No raw diff stored under key "${key}".`);
    }
    return diff;
  }
}
