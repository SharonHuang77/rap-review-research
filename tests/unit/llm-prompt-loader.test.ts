import { test } from "node:test";
import assert from "node:assert/strict";

import { PromptLoader } from "../../src/llm/prompts/prompt-loader.ts";
import { PromptNotFoundError } from "../../src/llm/errors.ts";

test("loads a versioned common template from disk", () => {
  const loader = new PromptLoader();
  const text = loader.load("v1", "common", "review-instructions");
  assert.match(text, /automated code reviewer/i);
});

test("loads role templates for each architecture category", () => {
  const loader = new PromptLoader();
  assert.match(loader.load("v1", "agentless", "system"), /single/i);
  assert.match(loader.load("v1", "hierarchical", "manager"), /Manager/);
  assert.match(loader.load("v1", "consensus", "specialist"), /consensus/i);
});

test("has() reflects template existence", () => {
  const loader = new PromptLoader();
  assert.equal(loader.has("v1", "agentless", "system"), true);
  assert.equal(loader.has("v1", "agentless", "missing"), false);
  assert.equal(loader.has("v9", "common", "review-instructions"), false);
});

test("loading a missing template throws PromptNotFoundError", () => {
  const loader = new PromptLoader();
  assert.throws(
    () => loader.load("v1", "common", "does-not-exist"),
    PromptNotFoundError,
  );
});
