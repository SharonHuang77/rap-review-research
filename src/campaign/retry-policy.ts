import { ProviderError, ValidationError } from "../shared/errors.ts";
import { DatasetAdapterError } from "../benchmark/index.ts";

/**
 * Classifies experiment failures as transient (retryable) or terminal, per the
 * runbook (03 §16–17).
 *
 * Retryable: transient infrastructure failures — provider errors, timeouts,
 * throttling, temporary service interruptions. NOT retryable: invalid benchmark
 * data, validation failures, parser/schema errors, and implementation bugs —
 * these are surfaced immediately rather than masked by retries.
 */
const TRANSIENT_PATTERN =
  /timeout|timed out|throttl|temporar|unavailable|econnreset|econnrefused|rate limit|too many requests|\b429\b|\b503\b|\b500\b/i;

export class RetryPolicy {
  /** Maximum attempts per run, including the first. Runbook caps this at 3. */
  public readonly maxAttempts: number;

  public constructor(maxAttempts = 3) {
    this.maxAttempts = Math.max(1, maxAttempts);
  }

  /** True when the failure looks like a transient infrastructure problem. */
  public isTransient(error: unknown): boolean {
    // Terminal categories take precedence — never retry these.
    if (error instanceof ValidationError) {
      return false;
    }
    if (error instanceof DatasetAdapterError) {
      return false;
    }
    if (error instanceof ProviderError) {
      return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PATTERN.test(message);
  }

  /**
   * Whether another attempt should be made. `attemptsMade` is the number of
   * attempts already completed (1 after the first failure).
   */
  public shouldRetry(error: unknown, attemptsMade: number): boolean {
    return attemptsMade < this.maxAttempts && this.isTransient(error);
  }
}
