import { test } from "node:test";
import assert from "node:assert/strict";

import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { sampleDiff } from "./support/diffs.ts";

test("renders snapshot metadata, changed files, and the diff", () => {
  const context = new ContextBuilder().build({
    snapshot: buildSnapshot(),
    rawDiff: sampleDiff(),
  });

  assert.match(context, /Title: Add feature/);
  assert.match(context, /Category: backend/);
  assert.match(context, /Total changed lines: 10/);
  assert.match(context, /- src\/x\.ts \(modified, \+8\/-2\)/);
  assert.match(context, /## Unified diff/);
  assert.match(context, /```diff/);
  assert.match(context, /src\/api\/users\.ts/); // from the diff body
});

test("renders (none) when description is absent", () => {
  const snapshot = buildSnapshot();
  const noDesc = { ...snapshot, description: undefined };
  const context = new ContextBuilder().build({ snapshot: noDesc, rawDiff: "x" });
  assert.match(context, /Description: \(none\)/);
});
