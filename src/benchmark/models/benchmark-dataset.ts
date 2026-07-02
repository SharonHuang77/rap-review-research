import type { BenchmarkInstance } from "./benchmark-instance.ts";

/**
 * The external PR-review benchmark a dataset came from. New benchmarks are added
 * as adapters without changing the evaluator (string-literal union per the
 * Development Guidelines).
 */
export type BenchmarkSource = "qodo-pr-review-bench" | "swe-prbench";

/**
 * A collection of benchmark instances loaded from one external dataset. Adapters
 * (RFC-13) produce this shape; the importer/runner/evaluator consume it.
 */
export interface BenchmarkDataset {
  readonly datasetId: string;
  readonly name: string;
  readonly source: BenchmarkSource;
  readonly instances: BenchmarkInstance[];
}
