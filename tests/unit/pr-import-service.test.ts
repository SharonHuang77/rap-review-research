import { test } from "node:test";
import assert from "node:assert/strict";

import { createPRImportService } from "../../src/services/snapshot/index.ts";
import { DefaultSnapshotIdGenerator } from "../../src/shared/id.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { DiffParseError, ImportError } from "../../src/shared/errors.ts";
import { sampleDiff } from "./support/diffs.ts";

function harness() {
  return createPRImportService({
    idGenerator: new DefaultSnapshotIdGenerator(),
    clock: new FixedClock("2026-06-29T00:00:00.000Z"),
  });
}

test("imports a sample .diff into an immutable PR snapshot (DoD)", async () => {
  const ctx = harness();

  const result = await ctx.service.importManualDiff({
    title: "Add user filtering + list component",
    source: "manual",
    rawDiff: sampleDiff(),
  });

  assert.equal(result.reusedExisting, false);
  assert.equal(result.snapshotId, "snap_001");

  const snapshot = await ctx.snapshots.getById(result.snapshotId);
  assert.ok(snapshot);
  // Immutable input record with detected files + classification.
  assert.equal(snapshot?.source, "manual");
  assert.equal(snapshot?.changedFiles.length, 2);
  assert.equal(snapshot?.totalChangedLines, 8);
  assert.equal(snapshot?.category, "cross-component"); // backend + frontend
  assert.equal(snapshot?.complexity, "small"); // < 100 changed lines
  assert.equal(snapshot?.importedAt, "2026-06-29T00:00:00.000Z");

  // Raw diff stored separately and retrievable via its key.
  assert.equal(snapshot?.rawDiffS3Key, "raw-diff/snap_001.diff");
  const stored = await ctx.rawDiffStorage.getRawDiff(
    snapshot?.rawDiffS3Key ?? "",
  );
  assert.equal(stored, sampleDiff());
});

test("changed line ranges are calculated", async () => {
  const ctx = harness();
  const result = await ctx.service.importManualDiff({
    title: "Sample",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  const snapshot = await ctx.snapshots.getById(result.snapshotId);

  assert.deepEqual(snapshot?.changedFiles[0]?.changedLineRanges, [
    { startLine: 11, endLine: 11, changeType: "removed" },
    { startLine: 11, endLine: 14, changeType: "added" },
  ]);
});

test("manual category and complexity overrides are honoured", async () => {
  const ctx = harness();
  const result = await ctx.service.importManualDiff({
    title: "Override",
    source: "synthetic",
    rawDiff: sampleDiff(),
    category: "database",
    complexity: "large",
  });
  const snapshot = await ctx.snapshots.getById(result.snapshotId);

  assert.equal(snapshot?.source, "synthetic");
  assert.equal(snapshot?.category, "database");
  assert.equal(snapshot?.complexity, "large");
});

test("rejects a request with no title", async () => {
  const ctx = harness();
  await assert.rejects(
    () =>
      ctx.service.importManualDiff({
        title: "   ",
        source: "manual",
        rawDiff: sampleDiff(),
      }),
    ImportError,
  );
});

test("rejects a request with no raw diff", async () => {
  const ctx = harness();
  await assert.rejects(
    () => ctx.service.importManualDiff({ title: "X", source: "manual", rawDiff: "" }),
    ImportError,
  );
});

test("rejects a diff that contains no changed files", async () => {
  const ctx = harness();
  await assert.rejects(
    () =>
      ctx.service.importManualDiff({
        title: "Garbage",
        source: "manual",
        rawDiff: "this is not a unified diff",
      }),
    DiffParseError,
  );
});

test("each manual import creates a distinct snapshot", async () => {
  const ctx = harness();
  const a = await ctx.service.importManualDiff({
    title: "A",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  const b = await ctx.service.importManualDiff({
    title: "B",
    source: "manual",
    rawDiff: sampleDiff(),
  });
  assert.notEqual(a.snapshotId, b.snapshotId);
});
