import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryRawDiffStorage } from "../../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemorySnapshotRepository } from "../../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { StorageError } from "../../src/shared/errors.ts";
import { buildSnapshot } from "./support/fixtures.ts";

test("raw diff storage round-trips content by key", async () => {
  const storage = new InMemoryRawDiffStorage();
  const key = await storage.saveRawDiff("snap_001", "diff --git a/x b/x");

  assert.equal(key, "raw-diff/snap_001.diff");
  assert.equal(await storage.getRawDiff(key), "diff --git a/x b/x");
});

test("raw diff storage throws for an unknown key", async () => {
  const storage = new InMemoryRawDiffStorage();
  await assert.rejects(() => storage.getRawDiff("missing"), StorageError);
});

test("snapshot repository deduplicates by idempotency key for GitHub-origin snapshots", async () => {
  const repo = new InMemorySnapshotRepository();
  await repo.create(
    buildSnapshot({
      snapshotId: "snap_gh",
      source: "github",
      repositoryOwner: "org",
      repositoryName: "rap-portal",
      prNumber: 42,
      commitHash: "commit-a",
    }),
  );

  const found = await repo.findByIdempotencyKey("org#rap-portal#42#commit-a");
  assert.equal(found?.snapshotId, "snap_gh");

  // A new commit is a different snapshot — not matched by the old key.
  assert.equal(
    await repo.findByIdempotencyKey("org#rap-portal#42#commit-b"),
    null,
  );
});

test("manual snapshots have no idempotency key and are never matched", async () => {
  const repo = new InMemorySnapshotRepository();
  await repo.create(buildSnapshot({ snapshotId: "snap_manual" }));

  // The manual fixture has no repo/PR/commit, so its key is null.
  assert.equal(await repo.findByIdempotencyKey("###"), null);
  assert.equal((await repo.getById("snap_manual"))?.snapshotId, "snap_manual");
});

test("snapshot repository rejects duplicate ids", async () => {
  const repo = new InMemorySnapshotRepository();
  await repo.create(buildSnapshot());
  await assert.rejects(() => repo.create(buildSnapshot()), StorageError);
});
