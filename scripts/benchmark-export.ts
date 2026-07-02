/**
 * Export benchmark results as a CSV research dataset (RFC-13).
 *
 * Run with: `npm run benchmark:export`
 * Imports + runs + evaluates the Qodo sample, then prints the benchmark CSV
 * (one row per architecture per instance). No files are written. No Bedrock.
 */
import {
  BenchmarkImporter,
  BenchmarkRunner,
  BenchmarkEvaluator,
  BenchmarkCsvExporter,
} from "../src/benchmark/index.ts";
import {
  EXECUTION_CONFIG,
  buildBenchmarkPipeline,
  loadSampleDatasets,
} from "./benchmark-shared.ts";

const { qodo } = loadSampleDatasets();
const { importService, experimentService, storage } = buildBenchmarkPipeline();

const imported = await new BenchmarkImporter(importService).import(qodo);
const runs = await new BenchmarkRunner({
  experimentService,
  storage,
  config: EXECUTION_CONFIG,
}).run(qodo, imported);

const results = new BenchmarkEvaluator().evaluateRuns(runs);
const csv = new BenchmarkCsvExporter().export(results, "2026-07-02T12:00:00.000Z");

console.log(`--- ${csv.fileName} (${csv.rowCount} rows) ---`);
console.log(csv.content);
