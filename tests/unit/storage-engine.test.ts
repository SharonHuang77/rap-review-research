import { test } from "node:test";
import assert from "node:assert/strict";

import { StorageEngine } from "../../src/storage/storage-engine.ts";
import { InMemoryRawResultRepository } from "../../src/storage/in-memory/in-memory-raw-result-repository.ts";
import { InMemoryValidatedResultRepository } from "../../src/storage/in-memory/in-memory-validated-result-repository.ts";
import { InMemoryFindingRepository } from "../../src/storage/in-memory/in-memory-finding-repository.ts";
import { DuplicateArtifactError } from "../../src/storage/storage-errors.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import type { RawReviewResult, ValidatedReviewResult } from "../../src/models/review-result.ts";

function engine() {
  return new StorageEngine({
    rawResults: new InMemoryRawResultRepository(),
    validatedResults: new InMemoryValidatedResultRepository(),
    findings: new InMemoryFindingRepository(),
    clock: new FixedClock("2026-07-02T00:00:00.000Z"),
  });
}

function rawResult(overrides: Partial<RawReviewResult> = {}): RawReviewResult {
  return {
    architecture: "agentless",
    summary: "raw summary",
    rawOutput: { summary: "raw summary", findings: [] },
    findings: [],
    inputTokens: 10,
    outputTokens: 5,
    latencyMs: 100,
    estimatedCostUsd: 0.001,
    messageCount: 1,
    llmCalls: 1,
    ...overrides,
  };
}

function validatedResult(
  overrides: Partial<ValidatedReviewResult> = {},
): ValidatedReviewResult {
  return {
    architecture: "agentless",
    summary: "validated summary",
    findings: [
      {
        id: "f1",
        title: "Issue",
        severity: "high",
        category: "security",
        file: "a.ts",
        line: 1,
        description: "d",
        recommendation: "r",
        confidence: 0.9,
      },
    ],
    validation: {
      schemaVersion: "review-result-v1",
      promptVersion: "v1",
      validationPassed: true,
      repaired: false,
      repairActions: [],
    },
    latencyMs: 100,
    inputTokens: 10,
    outputTokens: 5,
    estimatedCostUsd: 0.001,
    llmCalls: 1,
    messageCount: 1,
    ...overrides,
  };
}

test("stores and retrieves a raw result by experiment id", async () => {
  const storage = engine();
  await storage.storeRawResult({ experimentId: "exp_1", rawResult: rawResult() });

  const result = await storage.getExperimentResult("exp_1");
  assert.equal(result?.rawResult?.experimentId, "exp_1");
  assert.equal(result?.rawResult?.summary, "raw summary");
  assert.equal(result?.rawResult?.storedAt, "2026-07-02T00:00:00.000Z");
  assert.equal(result?.validatedResult, null);
  assert.deepEqual(result?.findings, []);
});

test("stores validated result and findings separately", async () => {
  const storage = engine();
  await storage.storeRawResult({ experimentId: "exp_1", rawResult: rawResult() });
  await storage.storeValidatedResult({
    experimentId: "exp_1",
    validatedResult: validatedResult(),
  });

  const result = await storage.getExperimentResult("exp_1");
  assert.equal(result?.validatedResult?.summary, "validated summary");
  assert.equal(result?.validatedResult?.findings.length, 1);
  // Findings are also stored individually, stamped with experiment + architecture.
  assert.equal(result?.findings.length, 1);
  assert.equal(result?.findings[0]?.id, "f1");
  assert.equal(result?.findings[0]?.experimentId, "exp_1");
  assert.equal(result?.findings[0]?.architecture, "agentless");
  assert.equal(result?.findings[0]?.storedAt, "2026-07-02T00:00:00.000Z");
});

test("getExperimentResult returns null when nothing is stored", async () => {
  assert.equal(await engine().getExperimentResult("nope"), null);
});

test("rejects duplicate raw and validated writes", async () => {
  const storage = engine();
  await storage.storeRawResult({ experimentId: "exp_1", rawResult: rawResult() });
  await assert.rejects(
    () => storage.storeRawResult({ experimentId: "exp_1", rawResult: rawResult() }),
    DuplicateArtifactError,
  );

  await storage.storeValidatedResult({ experimentId: "exp_1", validatedResult: validatedResult() });
  await assert.rejects(
    () =>
      storage.storeValidatedResult({ experimentId: "exp_1", validatedResult: validatedResult() }),
    DuplicateArtifactError,
  );
});

test("does not store validated result on its own — validation-failure preserves raw only", async () => {
  const storage = engine();
  // Simulate the failure flow: raw stored, validated never stored.
  await storage.storeRawResult({ experimentId: "exp_1", rawResult: rawResult() });

  const result = await storage.getExperimentResult("exp_1");
  assert.ok(result?.rawResult); // raw preserved
  assert.equal(result?.validatedResult, null); // validated absent
  assert.deepEqual(result?.findings, []);
});

test("stored raw output is not affected by later caller mutation", async () => {
  const storage = engine();
  const mutable = rawResult({ rawOutput: { note: "original" } });
  await storage.storeRawResult({ experimentId: "exp_1", rawResult: mutable });

  // Mutate the caller's object after storing.
  (mutable.rawOutput as { note: string }).note = "changed";

  const stored = await storage.getExperimentResult("exp_1");
  assert.deepEqual(stored?.rawResult?.rawOutput, { note: "original" });
});

test("mutating a retrieved result does not corrupt storage", async () => {
  const storage = engine();
  await storage.storeValidatedResult({ experimentId: "exp_1", validatedResult: validatedResult() });

  const first = await storage.getExperimentResult("exp_1");
  first?.validatedResult?.findings.push({
    id: "injected",
    title: "x",
    severity: "low",
    category: "x",
    file: "x",
    line: 0,
    description: "x",
    recommendation: "x",
    confidence: 0,
  });

  const second = await storage.getExperimentResult("exp_1");
  assert.equal(second?.validatedResult?.findings.length, 1); // still one
});
