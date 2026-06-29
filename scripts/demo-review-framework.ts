/**
 * Demo: the full RFC-01 + RFC-02 + RFC-03 path.
 *
 * Run with: `npm run demo:framework`
 *
 * 1. Import `tests/fixtures/sample.diff` into an immutable PR Snapshot (RFC-02).
 * 2. Register a mock review architecture in the registry (RFC-03).
 * 3. Run an experiment through the Experiment Engine (RFC-01), which resolves
 *    and executes the architecture *only* via the registry.
 * 4. Print the completed lifecycle.
 *
 * The PR Import service and the Experiment Engine share one snapshot repository,
 * so the engine runs against a real, imported snapshot — no seeding.
 */
import { readFileSync } from "node:fs";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryExperimentRepository } from "../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { MockReviewArchitecture } from "../src/architectures/mock/mock-review-architecture.ts";
import { ConsoleLogger } from "../src/shared/logger.ts";

const logger = new ConsoleLogger();

// Shared collaborators across the two services.
const snapshots = new InMemorySnapshotRepository();
const experiments = new InMemoryExperimentRepository();

// 1. Import the sample diff → immutable snapshot.
const importCtx = createPRImportService({ snapshots, logger });
const rawDiff = readFileSync(
  new URL("../tests/fixtures/sample.diff", import.meta.url),
  "utf8",
);
const { snapshotId } = await importCtx.service.importManualDiff({
  title: "Add user filtering + list component",
  source: "manual",
  rawDiff,
});

// 2. Register a mock architecture (RFC-03 plugin).
const registry = new InMemoryArchitectureRegistry();
registry.register(new MockReviewArchitecture({ name: "agentless" }));

// 3. Run an experiment through the Experiment Engine against the real snapshot.
const experimentCtx = createExperimentService({
  snapshots,
  experiments,
  registry,
  logger,
});
const result = await experimentCtx.service.runExperiment({
  snapshotId,
  architecture: "agentless",
  modelVersion: "gpt-4.1",
  promptVersion: "prompt-v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
});

// 4. Report.
console.log("\n--- imported snapshot ---");
console.log(JSON.stringify(await snapshots.getById(snapshotId), null, 2));
console.log("\n--- experiment result ---");
console.log(JSON.stringify(result, null, 2));
console.log("\n--- status transitions ---");
console.log(experiments.statusHistory(result.experimentId).join(" -> "));
