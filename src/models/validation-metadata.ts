/**
 * Metadata describing how a raw review result was validated and normalized.
 *
 * Produced by the Validation Engine (RFC-05) and carried on
 * {@link ValidatedReviewResult}; it becomes part of the experiment record.
 */
export interface ValidationMetadata {
  /** Version of the review-result schema used to validate. */
  readonly schemaVersion: string;
  /** Prompt version of the experiment that produced the raw result. */
  readonly promptVersion: string;
  /** Whether validation succeeded (always true on a returned result). */
  readonly validationPassed: boolean;
  /** Whether any repair/normalization was applied. */
  readonly repaired: boolean;
  /** Human-readable list of repair/normalization actions performed. */
  readonly repairActions: string[];
}
