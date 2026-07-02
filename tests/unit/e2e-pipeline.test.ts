import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { createExperimentService } from "../../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryExperimentRepository } from "../../src/repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../../src/architectures/agentless/agentless-architecture.ts";
import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../../src/llm/provider/mock-provider.ts";
import { ValidationEngine } from "../../src/validation/index.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import {
  DefaultIdGenerator,
  DefaultSnapshotIdGenerator,
} from "../../src/shared/id.ts";
import type { IOutputValidator } from "../../src/engines/experiment/ports.ts";
import type {
  RawReviewResult,
  ValidatedReviewResult,
} from "../../src/models/review-result.ts";
import { sampleDiff } from "./support/diffs.ts";

/**
 * Validator that records the RawReviewResult the engine hands it, then delegates
 * to the real passthrough. Lets the test assert on the raw result produced by
 * Agentless as it flows through the pipeline.
 */
class CapturingValidator implements IOutputValidator {
  public captured: RawReviewResult | null = null;
  private readonly inner = new ValidationEngine();

  public async validate(raw: RawReviewResult): Promise<ValidatedReviewResult> {
    this.captured = raw;
    return this.inner.validate(raw);
  }
}

/**
 * CANONICAL PLATFORM REGRESSION TEST.
 *
 * Exercises the entire pipeline on a real imported PR:
 *   sample.diff → PR Import Engine → PR Snapshot → Experiment Engine
 *   → ArchitectureRegistry → Agentless → MockProvider → RawReviewResult
 *
 * If this breaks, an end-to-end contract between modules has regressed.
 */
test("CANONICAL e2e: sample.diff → import → engine → agentless → mock → RawReviewResult", async () => {
  // --- shared infrastructure (one snapshot store + one raw-diff store) ---
  const snapshots = new InMemorySnapshotRepository();
  const rawDiffStorage = new InMemoryRawDiffStorage();
  const experiments = new InMemoryExperimentRepository();
  const validator = new CapturingValidator();

  let providerCalls = 0;
  const modelOutput = JSON.stringify({
    summary: "One low-risk change; no blocking issues.",
    riskLevel: "low",
    findings: [],
  });

  // --- Agentless (mock provider — no Bedrock) registered in the registry ---
  const registry = new InMemoryArchitectureRegistry();
  registry.register(
    new AgentlessArchitecture({
      provider: new MockProvider({
        response: {
          text: modelOutput,
          inputTokens: 640,
          outputTokens: 42,
          latencyMs: 815,
          estimatedCostUsd: 0.00234,
        },
        onReview: () => {
          providerCalls += 1;
        },
      }),
      promptBuilder: new PromptBuilder({
        loader: new PromptLoader(),
        contextBuilder: new ContextBuilder(),
      }),
      rawDiffStorage,
    }),
  );

  // --- STAGE 1: PR Import Engine (RFC-02) ---
  const importCtx = createPRImportService({
    snapshots,
    rawDiffStorage,
    idGenerator: new DefaultSnapshotIdGenerator(),
    clock: new FixedClock(),
  });
  const imported = await importCtx.service.importManualDiff({
    title: "Add user filtering + list component",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  assert.equal(imported.reusedExisting, false);

  const snapshot = await snapshots.getById(imported.snapshotId);
  assert.ok(snapshot, "snapshot persisted by the import engine");
  assert.equal(snapshot?.changedFiles.length, 2);
  assert.equal(snapshot?.category, "cross-component");

  // --- STAGE 2: Experiment Engine (RFC-01) → Agentless (RFC-04) ---
  const experimentCtx = createExperimentService({
    snapshots,
    experiments,
    registry,
    validator,
    idGenerator: new DefaultIdGenerator(),
    clock: new FixedClock(),
  });
  const run = await experimentCtx.service.runExperiment({
    snapshotId: imported.snapshotId,
    architecture: "agentless",
    modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    promptVersion: "v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
  });

  // --- the pipeline succeeded ---
  assert.equal(run.status, "completed");
  assert.equal(run.reusedExisting, false);
  assert.equal(providerCalls, 1, "exactly one LLM provider call end-to-end");
  assert.deepEqual(experiments.statusHistory(run.experimentId), [
    "created",
    "queued",
    "running",
    "validating",
    "evaluating",
    "completed",
  ]);

  // --- the RawReviewResult produced by Agentless flowed through the engine ---
  const raw = validator.captured;
  assert.ok(raw, "RawReviewResult reached the validation stage");
  assert.equal(raw?.architecture, "agentless");
  assert.equal(raw?.llmCalls, 1);
  assert.equal(raw?.inputTokens, 640);
  assert.equal(raw?.outputTokens, 42);
  assert.equal(raw?.latencyMs, 815);
  assert.equal(raw?.estimatedCostUsd, 0.00234);
  assert.equal(raw?.summary, "One low-risk change; no blocking issues.");
  assert.deepEqual(raw?.findings, []);
  assert.equal(raw?.rawOutput, modelOutput);

  // --- the completed experiment persisted the execution metrics ---
  const experiment = await experiments.findById(run.experimentId);
  assert.equal(experiment?.status, "completed");
  assert.equal(experiment?.totalInputTokens, 640);
  assert.equal(experiment?.totalOutputTokens, 42);
  assert.equal(experiment?.estimatedCostUsd, 0.00234);
});
