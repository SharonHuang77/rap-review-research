import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyFile,
  classifyCategory,
  classifyComplexity,
} from "../../src/engines/pr-import/classification.ts";
import type { ChangedFile } from "../../src/models/snapshot.ts";

function file(path: string): ChangedFile {
  return {
    path,
    changeType: "modified",
    additions: 1,
    deletions: 0,
    changedLineRanges: [],
  };
}

test("classifyFile maps paths to implementation areas", () => {
  assert.equal(classifyFile("src/components/Button.tsx"), "frontend");
  assert.equal(classifyFile("app/dashboard/page.tsx"), "frontend");
  assert.equal(classifyFile("src/api/users/route.ts"), "backend");
  assert.equal(classifyFile("src/server/auth-controller.ts"), "backend");
  assert.equal(classifyFile("prisma/schema.prisma"), "database");
  assert.equal(classifyFile("db/migrations/001_init.sql"), "database");
  assert.equal(classifyFile(".github/workflows/ci.yml"), "infrastructure");
  assert.equal(classifyFile("infra/terraform/main.tf"), "infrastructure");
  assert.equal(classifyFile("docs/setup.md"), "documentation");
  assert.equal(classifyFile("misc/file.txt"), "unknown");
});

test("classifyCategory returns the single area when only one is touched", () => {
  assert.equal(
    classifyCategory([file("src/api/a.ts"), file("src/server/b.ts")]),
    "backend",
  );
});

test("classifyCategory returns cross-component for multiple areas", () => {
  assert.equal(
    classifyCategory([file("src/api/a.ts"), file("src/components/B.tsx")]),
    "cross-component",
  );
});

test("classifyCategory returns unknown when nothing recognisable changed", () => {
  assert.equal(classifyCategory([file("misc/file.txt")]), "unknown");
});

test("classifyComplexity buckets by total changed lines", () => {
  assert.equal(classifyComplexity(0), "small");
  assert.equal(classifyComplexity(99), "small");
  assert.equal(classifyComplexity(100), "medium");
  assert.equal(classifyComplexity(500), "medium");
  assert.equal(classifyComplexity(501), "large");
});
