/**
 * Run a small benchmark subset through all three architectures (RFC-13).
 *
 * Run with: `npm run benchmark:run`
 * Every instance is reviewed by Agentless, Hierarchical, and Consensus. Mock
 * provider; no Bedrock.
 */
import { BenchmarkImporter, BenchmarkRunner } from "../src/benchmark/index.ts";
import {
  EXECUTION_CONFIG,
  buildBenchmarkPipeline,
  loadSampleDatasets,
} from "./benchmark-shared.ts";

const { qodo } = loadSampleDatasets();
const { importService, experimentService, storage } = buildBenchmarkPipeline();

const imported = await new BenchmarkImporter(importService).import(qodo);
const runner = new BenchmarkRunner({
  experimentService,
  storage,
  config: EXECUTION_CONFIG,
});
const runs = await runner.run(qodo, imported);

console.log(`Produced ${runs.length} benchmark run(s):`);
for (const run of runs) {
  console.log(
    `${run.instanceId.padEnd(10)} ${run.architecture.padEnd(13)} ` +
      `findings=${run.producedFindings.length} groundTruth=${run.groundTruth.length}`,
  );
}
