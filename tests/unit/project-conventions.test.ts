import { test } from "node:test";
import assert from "node:assert/strict";

import {
  coversCategory,
  renderConventions,
  repoOfInstance,
  PROJECT_CONVENTIONS,
} from "../../src/grounding/project-conventions.ts";

test("repoOfInstance strips the PR suffix", () => {
  assert.equal(repoOfInstance("Ghost-pr-3"), "Ghost");
  assert.equal(repoOfInstance("aspnetcore-pr-12"), "aspnetcore");
});

test("coversCategory matches real injected categories to a repo convention", () => {
  assert.ok(coversCategory("Ghost", "Code Must Use Single Quotes for Strings"));
  assert.ok(coversCategory("Ghost", "Package Manager Must Be Yarn v1"));
  assert.ok(coversCategory("Ghost", "Rule 18: Code Must Use Single Quotes for Strings"), "numbered variant still matches");
  assert.ok(coversCategory("aspnetcore", "Use File-Scoped Namespace Declarations"));
  assert.ok(coversCategory("aspnetcore", "Async Methods Must Be Named with Async Suffix"));
  assert.ok(coversCategory("aspnetcore", "Opening Braces Must Be on New Line (Allman Style)"));
});

test("coversCategory returns undefined for an unrelated / unknown convention", () => {
  assert.equal(coversCategory("Ghost", "Rust Code Must Pass Clippy Linting"), undefined);
  assert.equal(coversCategory("nonexistent-repo", "Anything"), undefined);
});

test("coversCategory does NOT leak: it is keyed on repo conventions, not the GT string verbatim", () => {
  // a convention exists, but a category with no shared distinctive key stays uncovered
  assert.equal(coversCategory("aspnetcore", "Frontend Code Must Not Use console Statements"), undefined);
});

test("renderConventions produces an instance-blind bullet block", () => {
  const block = renderConventions("Ghost");
  assert.match(block, /## Project conventions \(Ghost\)/);
  assert.match(block, /single quotes/i);
  assert.ok(!/pr-\d+/.test(block), "must not reference any specific PR");
  // one bullet per convention
  assert.equal((block.match(/^- /gm) ?? []).length, PROJECT_CONVENTIONS.Ghost.length);
});
