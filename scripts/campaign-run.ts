/**
 * Run a full benchmark campaign end-to-end (Experiment Campaign Runner).
 *
 * Run with: `npm run campaign:run`
 * Loads the Qodo + SWE sample datasets and executes Agentless, Hierarchical, and
 * Consensus on every instance, then prints the manifest progress, the campaign
 * summary, reproducible logs, and the heads of the campaign exports. Mock
 * provider — no Bedrock.
 */
import { CampaignRunner, InMemoryManifestStore, ProgressReporter } from "../src/campaign/index.ts";
import { FixedClock } from "../src/shared/clock.ts";
import {
  EXECUTION_CONFIG,
  buildBenchmarkPipeline,
  loadSampleDatasets,
} from "./benchmark-shared.ts";

const { qodo, swe } = loadSampleDatasets();
const { importService, experimentService, storage } = buildBenchmarkPipeline();

const reporter = new ProgressReporter({ clock: new FixedClock() });
const runner = new CampaignRunner({
  importService,
  experimentService,
  storage,
  reporter,
  manifestStore: new InMemoryManifestStore(),
  clock: new FixedClock(),
});

const report = await runner.run([qodo, swe], {
  campaignId: "campaign-demo",
  modelVersion: EXECUTION_CONFIG.modelVersion,
  promptVersion: EXECUTION_CONFIG.promptVersion,
  workflowVersion: EXECUTION_CONFIG.workflowVersion,
  evaluationVersion: EXECUTION_CONFIG.evaluationVersion,
  platformVersion: "v1.0.0",
  awsRegion: "us-west-2",
  generatedAt: "2026-07-02T12:00:00.000Z",
});

console.log("=== manifest progress ===");
console.log(JSON.stringify(report.summary.progress, null, 2));

console.log("\n=== per-architecture summary ===");
for (const s of report.summary.perArchitecture) {
  console.log(
    `${s.architecture.padEnd(13)} n=${s.instanceCount} ` +
      `meanP=${s.meanPrecision.toFixed(2)} meanR=${s.meanRecall.toFixed(2)} meanF1=${s.meanF1.toFixed(2)}`,
  );
}

console.log("\n=== reproducible logs ===");
console.log(report.logs.join("\n"));

console.log("\n=== benchmark CSV ===");
console.log(report.exports.benchmarkCsv);

console.log(`\n=== campaign JSON (${report.exports.campaignJson.length} bytes) ===`);
console.log(`${report.exports.campaignJson.slice(0, 400)}…`);
