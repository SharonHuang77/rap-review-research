import type { BenchmarkDataset } from "../models/benchmark-dataset.ts";

/**
 * Maps an external benchmark's raw dataset shape (`TRaw`) into the platform's
 * {@link BenchmarkDataset}. Pluggable per benchmark, mirroring the platform's
 * other strategy contracts (IExperimentExporter, IEvidenceScorer, …).
 *
 * Adapters are pure and deterministic: no network, no filesystem, no LLM — the
 * caller is responsible for loading the raw rows (from a small fixture in tests,
 * or a downloaded file in a real run). This keeps huge datasets out of the
 * module and out of tests.
 */
export interface IBenchmarkDatasetAdapter<TRaw> {
  readonly source: BenchmarkDataset["source"];
  toDataset(raw: TRaw): BenchmarkDataset;
}
