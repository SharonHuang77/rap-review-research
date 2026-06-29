import { test } from "node:test";
import assert from "node:assert/strict";

import { createExperimentService } from "../../src/services/experiment/create-experiment-service.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { MockReviewArchitecture } from "../../src/architectures/mock/mock-review-architecture.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DefaultIdGenerator } from "../../src/shared/id.ts";
import { buildSnapshot, buildRunInput } from "./support/fixtures.ts";

test("ExperimentService drives the full lifecycle via a mock architecture", async () => {
  const registry = new InMemoryArchitectureRegistry();
  registry.register(new MockReviewArchitecture({ name: "agentless" }));

  const ctx = createExperimentService({
    registry,
    clock: new FixedClock(),
    idGenerator: new DefaultIdGenerator(),
  });
  await ctx.snapshots.create(buildSnapshot());

  const result = await ctx.service.runExperiment(buildRunInput());
  assert.equal(result.status, "completed");
  assert.equal(result.reusedExisting, false);

  const status = await ctx.service.getExperimentStatus(result.experimentId);
  assert.equal(status, "completed");
});

test("ExperimentService default wiring needs an architecture registered", async () => {
  // The default registry is empty: running without registering an architecture
  // results in a failed experiment rather than a thrown error.
  const ctx = createExperimentService({ clock: new FixedClock() });
  await ctx.snapshots.create(buildSnapshot());

  const result = await ctx.service.runExperiment(buildRunInput());
  assert.equal(result.status, "failed");
});
