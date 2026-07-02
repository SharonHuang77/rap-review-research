import { DomainError } from "../shared/errors.ts";

/**
 * Base error for the Benchmark Evaluation module (RFC-13). `code` is typed as
 * `string` so subclasses can supply their own stable code.
 */
export class BenchmarkError extends DomainError {
  public readonly code: string = "BENCHMARK_ERROR";
}

/** A raw dataset row could not be mapped into a benchmark model. Not retryable. */
export class DatasetAdapterError extends BenchmarkError {
  public override readonly code = "BENCHMARK_DATASET_ADAPTER_ERROR";
}

/** A benchmark run could not be produced (import/execution failed). */
export class BenchmarkRunError extends BenchmarkError {
  public override readonly code = "BENCHMARK_RUN_ERROR";
}
