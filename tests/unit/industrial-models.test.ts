import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHITECTURE_ARMS, FAMILY_ARMS, runKey } from "../../src/industrial/models.ts";

test("architecture arms are the four ladder rungs", () => {
  assert.deepEqual(ARCHITECTURE_ARMS, ["agentless", "generalists-3", "hierarchical", "consensus"]);
});

test("family arms are the three cross-family agentless models", () => {
  assert.equal(FAMILY_ARMS.length, 3);
  assert.ok(FAMILY_ARMS.includes("us.anthropic.claude-haiku-4-5-20251001-v1:0"));
});

test("runKey is stable and unique per (pr, axis, arm, run)", () => {
  assert.equal(runKey({ pr: "12", axis: "architecture", arm: "consensus", runIndex: 2 }), "12|architecture|consensus|2");
});
