import { test } from "node:test";
import assert from "node:assert/strict";

import type { CampaignManifestData } from "../../src/campaign/index.ts";
import {
  Manifest,
  manifestEntryKey,
  InMemoryManifestStore,
} from "../../src/campaign/index.ts";

function data(): CampaignManifestData {
  return {
    campaignId: "c1",
    createdAt: "2026-01-01T00:00:00.000Z",
    modelVersion: "m",
    promptVersion: "v1",
    workflowVersion: "w1",
    evaluationVersion: "e1",
    entries: [
      { datasetId: "d", instanceId: "i1", architecture: "agentless", run: 1, status: "pending", attempts: 0 },
      { datasetId: "d", instanceId: "i1", architecture: "hierarchical", run: 1, status: "pending", attempts: 0 },
    ],
  };
}

test("entry key is stable and unique per instance/architecture/run", () => {
  assert.equal(
    manifestEntryKey({ instanceId: "i1", architecture: "consensus", run: 2 }),
    "i1#consensus#2",
  );
});

test("update mutates the addressed entry and progress reflects it", () => {
  const m = new Manifest(data());
  assert.deepEqual(m.progress(), {
    total: 2,
    pending: 2,
    running: 0,
    completed: 0,
    failed: 0,
    retryScheduled: 0,
  });

  m.update("i1#agentless#1", { status: "completed", experimentId: "exp-1" });
  const entry = m.get("i1#agentless#1");
  assert.equal(entry?.status, "completed");
  assert.equal(entry?.experimentId, "exp-1");
  assert.equal(m.progress().completed, 1);
  assert.equal(m.incomplete().length, 1);
});

test("toJSON/fromJSON round-trips without shared references", () => {
  const m = new Manifest(data());
  m.update("i1#agentless#1", { status: "completed" });
  const json = m.toJSON();
  const restored = Manifest.fromJSON(json);
  assert.equal(restored.get("i1#agentless#1")?.status, "completed");
  // Mutating the restored manifest must not affect the original snapshot.
  restored.update("i1#hierarchical#1", { status: "failed" });
  assert.equal(json.entries[1]!.status, "pending");
});

test("InMemoryManifestStore saves and loads a deep copy", async () => {
  const store = new InMemoryManifestStore();
  assert.equal(await store.load("c1"), null);
  await store.save(data());
  const loaded = await store.load("c1");
  assert.ok(loaded);
  loaded!.entries[0]!.status = "failed";
  const reloaded = await store.load("c1");
  assert.equal(reloaded!.entries[0]!.status, "pending"); // stored copy untouched
});
