import { test } from "node:test";
import assert from "node:assert/strict";

import { UnifiedDiffParser } from "../../src/engines/pr-import/diff-parser.ts";
import { sampleDiff, ADDED_FILE_DIFF } from "./support/diffs.ts";

test("parses the sample diff into two changed files", () => {
  const parsed = new UnifiedDiffParser().parse(sampleDiff());

  assert.equal(parsed.files.length, 2);
  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ["src/api/users.ts", "src/components/UserList.tsx"],
  );
});

test("detects change types, additions and deletions", () => {
  const parsed = new UnifiedDiffParser().parse(sampleDiff());
  const [modified, added] = parsed.files;

  assert.equal(modified?.changeType, "modified");
  assert.equal(modified?.additions, 4);
  assert.equal(modified?.deletions, 1);

  assert.equal(added?.changeType, "added");
  assert.equal(added?.additions, 3);
  assert.equal(added?.deletions, 0);

  // total changed lines = 4 + 1 + 3 + 0
  assert.equal(parsed.totalChangedLines, 8);
});

test("computes changed line ranges in the correct coordinates", () => {
  const parsed = new UnifiedDiffParser().parse(sampleDiff());
  const [modified, added] = parsed.files;

  // Removed line is old-file line 11; added run is new-file lines 11-14.
  assert.deepEqual(modified?.changedLineRanges, [
    { startLine: 11, endLine: 11, changeType: "removed" },
    { startLine: 11, endLine: 14, changeType: "added" },
  ]);

  assert.deepEqual(added?.changedLineRanges, [
    { startLine: 1, endLine: 3, changeType: "added" },
  ]);
});

test("parses a newly added file with /dev/null source", () => {
  const parsed = new UnifiedDiffParser().parse(ADDED_FILE_DIFF);

  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.path, "docs/guide.md");
  assert.equal(parsed.files[0]?.changeType, "added");
  assert.equal(parsed.totalChangedLines, 2);
});

test("returns no files for an empty or non-diff input", () => {
  const parser = new UnifiedDiffParser();
  assert.equal(parser.parse("").files.length, 0);
  assert.equal(parser.parse("not a diff at all").files.length, 0);
});
