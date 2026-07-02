import { test } from "node:test";
import assert from "node:assert/strict";

import { RetryPolicy } from "../../src/campaign/index.ts";
import { ProviderError, ValidationError } from "../../src/shared/errors.ts";
import { DatasetAdapterError } from "../../src/benchmark/index.ts";

test("provider errors and transient messages are retryable", () => {
  const policy = new RetryPolicy();
  assert.equal(policy.isTransient(new ProviderError("bedrock down")), true);
  assert.equal(policy.isTransient(new Error("Request timeout")), true);
  assert.equal(policy.isTransient(new Error("ThrottlingException")), true);
  assert.equal(policy.isTransient(new Error("service temporarily unavailable")), true);
  assert.equal(policy.isTransient(new Error("HTTP 503")), true);
});

test("validation, adapter, and generic errors are not retryable", () => {
  const policy = new RetryPolicy();
  assert.equal(policy.isTransient(new ValidationError("bad schema")), false);
  assert.equal(policy.isTransient(new DatasetAdapterError("bad row")), false);
  assert.equal(policy.isTransient(new Error("unexpected token in JSON")), false);
});

test("shouldRetry respects the max attempt cap", () => {
  const policy = new RetryPolicy(3);
  const transient = new ProviderError("throttled");
  assert.equal(policy.shouldRetry(transient, 1), true);
  assert.equal(policy.shouldRetry(transient, 2), true);
  assert.equal(policy.shouldRetry(transient, 3), false); // cap reached
  // Terminal errors are never retried, even on the first attempt.
  assert.equal(policy.shouldRetry(new ValidationError("x"), 1), false);
});
