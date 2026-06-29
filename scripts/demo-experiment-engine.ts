/**
 * Demo: run one experiment end-to-end through the Experiment Engine using a
 * mock review architecture (no LLM, no database, no AWS).
 *
 * Run with: `npm run demo`
 *
 * It wires the engine with a ConsoleLogger so every lifecycle transition
 * (created → queued → running → validating → evaluating → completed) is printed.
 */
import { createExperimentService } from "../src/services/experiment/index.ts";
import {
  InMemoryArchitectureRegistry,
  MockReviewArchitecture,
} from "../src/architectures/index.ts";
import { InMemoryExperimentRepository } from "../src/repositories/index.ts";
import { ConsoleLogger } from "../src/shared/logger.ts";
import type { PRSnapshot } from "../src/models/snapshot.ts";
import type { RunExperimentInput } from "../src/models/experiment.ts";

const registry = new InMemoryArchitectureRegistry();
registry.register(new MockReviewArchitecture({ name: "agentless" }));

const experiments = new InMemoryExperimentRepository();
const ctx = createExperimentService({
  experiments,
  registry,
  logger: new ConsoleLogger(),
});

const snapshot: PRSnapshot = {
  snapshotId: "snap_042",
  repository: "org/rap-portal",
  prNumber: 42,
  commitHash: "deadbeef",
  title: "Add login rate limiting",
  description: "Throttles repeated failed login attempts.",
  rawDiff: "diff --git a/auth.ts b/auth.ts",
  changedFiles: [
    { path: "src/auth.ts", changedLines: [{ start: 10, end: 28 }] },
  ],
  importedAt: "2026-06-28T00:00:00.000Z",
};
await ctx.snapshots.save(snapshot);

const input: RunExperimentInput = {
  snapshotId: "snap_042",
  architecture: "agentless",
  modelVersion: "gpt-4.1",
  promptVersion: "prompt-v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
};

const result = await ctx.service.runExperiment(input);

console.log("\n--- result ---");
console.log(JSON.stringify(result, null, 2));
console.log("\n--- status transitions ---");
console.log(experiments.statusHistory(result.experimentId).join(" -> "));

const status = await ctx.service.getExperimentStatus(result.experimentId);
console.log(`\nfinal status: ${status}`);
