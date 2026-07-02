/**
 * Import a small benchmark subset into PR snapshots (RFC-13).
 *
 * Run with: `npm run benchmark:import`
 * Loads the Qodo + SWE sample fixtures, adapts them, and imports each instance
 * through the PR Import Engine. No Bedrock.
 */
import { BenchmarkImporter } from "../src/benchmark/index.ts";
import { buildBenchmarkPipeline, loadSampleDatasets } from "./benchmark-shared.ts";

const { qodo, swe } = loadSampleDatasets();
const { importService } = buildBenchmarkPipeline();
const importer = new BenchmarkImporter(importService);

for (const dataset of [qodo, swe]) {
  const imported = await importer.import(dataset);
  console.log(`\n=== ${dataset.name} (${dataset.source}) ===`);
  for (const { instance, snapshotId } of imported) {
    console.log(
      `${instance.instanceId} → snapshot ${snapshotId} ` +
        `(${instance.groundTruth.length} ground-truth issue(s))`,
    );
  }
}
