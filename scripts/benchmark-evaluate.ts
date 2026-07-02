/**
 * Evaluate benchmark runs against ground truth (RFC-13).
 *
 * Run with: `npm run benchmark:evaluate`
 * Imports + runs the Qodo sample through all three architectures, then computes
 * precision / recall / F1 / localization accuracy. No Bedrock.
 */
import {
  BenchmarkImporter,
  BenchmarkRunner,
  BenchmarkEvaluator,
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

const evaluator = new BenchmarkEvaluator();
const results = evaluator.evaluateRuns(runs);

console.log("--- per-run results ---");
for (const r of results) {
  console.log(
    `${r.instanceId.padEnd(10)} ${r.architecture.padEnd(13)} ` +
      `P=${r.precision.toFixed(2)} R=${r.recall.toFixed(2)} F1=${r.f1.toFixed(2)} ` +
      `loc=${r.localizationAccuracy.toFixed(2)} tp=${r.truePositives} fp=${r.falsePositives} fn=${r.falseNegatives}`,
  );
}

console.log("\n--- macro summary by architecture ---");
for (const s of evaluator.summarizeByArchitecture(results)) {
  console.log(
    `${s.architecture.padEnd(13)} n=${s.instanceCount} ` +
      `meanP=${s.meanPrecision.toFixed(2)} meanR=${s.meanRecall.toFixed(2)} meanF1=${s.meanF1.toFixed(2)}`,
  );
}
