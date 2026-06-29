import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryArchitectureRegistry } from "../../src/architectures/in-memory-architecture-registry.ts";
import { MockReviewArchitecture } from "../../src/architectures/mock/mock-review-architecture.ts";
import { UnknownArchitectureError } from "../../src/shared/errors.ts";

test("registry resolves a registered mock architecture", () => {
  const registry = new InMemoryArchitectureRegistry();
  const mock = new MockReviewArchitecture({ name: "agentless" });
  registry.register(mock);

  assert.equal(registry.has("agentless"), true);
  assert.equal(registry.get("agentless"), mock);
  assert.equal(registry.get("agentless").name, "agentless");
});

test("registry throws UnknownArchitectureError for an unregistered name", () => {
  const registry = new InMemoryArchitectureRegistry();

  assert.equal(registry.has("hierarchical"), false);
  assert.throws(
    () => registry.get("hierarchical"),
    UnknownArchitectureError,
  );
});

test("register replaces an existing architecture of the same name", () => {
  const registry = new InMemoryArchitectureRegistry();
  const first = new MockReviewArchitecture({ name: "consensus" });
  const second = new MockReviewArchitecture({ name: "consensus" });

  registry.register(first);
  registry.register(second);

  assert.equal(registry.get("consensus"), second);
});
