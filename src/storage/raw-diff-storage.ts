/**
 * Storage port for large raw-diff artifacts.
 *
 * Raw unified diffs are kept out of the main snapshot record (they can be
 * large). In production this is backed by S3; here it is in-memory. Business
 * logic depends only on this interface.
 */
export interface RawDiffStorage {
  /**
   * Persist a raw diff for a snapshot and return the storage key that can later
   * be passed to {@link getRawDiff}.
   */
  saveRawDiff(snapshotId: string, rawDiff: string): Promise<string>;

  /** Retrieve a previously stored raw diff by its storage key. */
  getRawDiff(key: string): Promise<string>;
}
