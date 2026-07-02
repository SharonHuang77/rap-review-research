import { StorageError } from "../shared/errors.ts";

/**
 * Typed errors for the Storage Engine (RFC-06). All extend the shared
 * {@link StorageError} base, so callers can catch `StorageError` to handle any
 * storage failure.
 */
export { StorageError };

/** A write operation failed. */
export class StorageWriteError extends StorageError {
  public override readonly code = "STORAGE_WRITE_ERROR";
}

/** A read operation failed. */
export class StorageReadError extends StorageError {
  public override readonly code = "STORAGE_READ_ERROR";
}

/**
 * An artifact already exists for the given key. Historical artifacts are
 * immutable, so duplicate writes are rejected.
 */
export class DuplicateArtifactError extends StorageError {
  public override readonly code = "DUPLICATE_ARTIFACT";
}
