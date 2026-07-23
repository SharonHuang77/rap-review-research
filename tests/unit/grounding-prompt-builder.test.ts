import { test } from "node:test";
import assert from "node:assert/strict";

import { PromptBuilder } from "../../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../../src/llm/prompts/context-builder.ts";
import { GroundingPromptBuilder } from "../../src/grounding/grounding-prompt-builder.ts";
import type { PRSnapshot } from "../../src/models/snapshot.ts";

const snapshot: PRSnapshot = {
  snapshotId: "Ghost-pr-3",
  source: "synthetic",
  repositoryName: "Ghost",
  title: "Fix quoting",
  rawDiffS3Key: "k",
  changedFiles: [],
  totalChangedLines: 0,
  category: "frontend",
  complexity: "small",
  importedAt: "2026-07-22T00:00:00Z",
};

const deps = { loader: new PromptLoader(), contextBuilder: new ContextBuilder() };
const buildInput = {
  promptVersion: "v1",
  role: { category: "agentless", name: "system" },
  snapshot,
  rawDiff: "diff --git a/x.js b/x.js\n+const a = \"y\";",
  modelId: "m",
  temperature: 0,
  maxTokens: 100,
};

test("grounded build injects the repo conventions block into the user prompt", () => {
  const gb = new GroundingPromptBuilder({ ...deps, resolveRepo: (s) => s.repositoryName });
  const req = gb.build(buildInput);
  assert.match(req.userPrompt, /## Project conventions \(Ghost\)/);
  assert.match(req.userPrompt, /single quotes/i);
});

test("unknown repo ⇒ byte-identical to the base builder (ungrounded path untouched)", () => {
  const base = new PromptBuilder(deps);
  const gb = new GroundingPromptBuilder({ ...deps, resolveRepo: () => undefined });
  assert.equal(gb.build(buildInput).userPrompt, base.build(buildInput).userPrompt);
  assert.equal(gb.build(buildInput).systemPrompt, base.build(buildInput).systemPrompt);
});

test("system prompt is unchanged by grounding (only the user prompt carries conventions)", () => {
  const base = new PromptBuilder(deps);
  const gb = new GroundingPromptBuilder({ ...deps, resolveRepo: (s) => s.repositoryName });
  assert.equal(gb.build(buildInput).systemPrompt, base.build(buildInput).systemPrompt);
});
