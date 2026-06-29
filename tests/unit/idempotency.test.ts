import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildIdempotencyKey,
  DefaultIdGenerator,
} from "../../src/shared/id.ts";
import { buildRunInput } from "./support/fixtures.ts";

test("buildIdempotencyKey joins identity fields deterministically", () => {
  const key = buildIdempotencyKey(buildRunInput());
  assert.equal(
    key,
    "snap_001#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1",
  );
});

test("buildIdempotencyKey changes when any identity field changes", () => {
  const base = buildIdempotencyKey(buildRunInput());
  const other = buildIdempotencyKey(
    buildRunInput({ architecture: "hierarchical" }),
  );
  assert.notEqual(base, other);
});

test("DefaultIdGenerator returns the key for first runs and versions reruns", () => {
  const ids = new DefaultIdGenerator();
  const key = "snap_001#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1";

  assert.equal(ids.nextExperimentId(key, false), key);
  assert.equal(ids.nextExperimentId(key, true), `${key}#rerun-1`);
  assert.equal(ids.nextExperimentId(key, true), `${key}#rerun-2`);
});
