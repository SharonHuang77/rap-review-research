import { ValidationError } from "../shared/errors.ts";

/**
 * Typed errors for the Validation Engine (RFC-05). All extend the shared
 * {@link ValidationError} base, so callers can catch `ValidationError` to
 * handle any validation failure.
 */
export { ValidationError };

/** Raw output could not be reduced to a parseable JSON object. */
export class JSONExtractionError extends ValidationError {
  public override readonly code = "JSON_EXTRACTION_ERROR";
}

/** Parsed JSON did not satisfy the review-result schema. */
export class SchemaValidationError extends ValidationError {
  public override readonly code = "SCHEMA_VALIDATION_ERROR";
}

/** A validated value could not be normalized (e.g. unrecognized severity). */
export class NormalizationError extends ValidationError {
  public override readonly code = "NORMALIZATION_ERROR";
}
