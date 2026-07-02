import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QodoPRReviewBenchAdapter,
  SWEPRBenchAdapter,
} from "../../src/benchmark/index.ts";

// These exercise the tolerant field-name resolution so a real dataset export
// (which may use different-but-equivalent field names) maps without changes.

test("Qodo adapter resolves alias field names (data/patch/pr_number/ground_truth)", () => {
  const dataset = new QodoPRReviewBenchAdapter().toDataset({
    data: [
      {
        pr_number: 4217,
        patch: "diff --git a/x b/x\n",
        ground_truth: [
          {
            path: "src/x.ts",
            start_line: "12", // numeric string
            end_line: 15,
            issue_type: "security",
            priority: "critical",
            summary: "Injection",
            body: "User input flows into a query.",
          },
        ],
      },
    ],
  });

  const instance = dataset.instances[0]!;
  assert.equal(instance.instanceId, "4217"); // pr_number stringified
  assert.ok(instance.rawDiff.startsWith("diff --git"));

  const gt = instance.groundTruth[0]!;
  assert.equal(gt.file, "src/x.ts");
  assert.equal(gt.lineStart, 12); // coerced from "12"
  assert.equal(gt.lineEnd, 15);
  assert.equal(gt.category, "security"); // from issue_type
  assert.equal(gt.severity, "critical"); // from priority
  assert.equal(gt.title, "Injection"); // from summary
  assert.equal(gt.description, "User input flows into a query."); // from body
});

test("Qodo adapter defaults end line to start line via aliases", () => {
  const dataset = new QodoPRReviewBenchAdapter().toDataset({
    rows: [
      { id: "q", diff: "d", issues: [{ file: "a.ts", line_number: 9 }] },
    ],
  });
  const gt = dataset.instances[0]!.groundTruth[0]!;
  assert.equal(gt.lineStart, 9);
  assert.equal(gt.lineEnd, 9);
});

test("SWE adapter resolves alias field names (rows/diff/comments/line_number)", () => {
  const dataset = new SWEPRBenchAdapter().toDataset({
    rows: [
      {
        id: "swe-9",
        diff: "diff --git a/y b/y\n",
        comments: [
          { file: "src/y.ts", line_number: "7", message: "Handle the empty case." },
        ],
      },
    ],
  });

  const instance = dataset.instances[0]!;
  assert.equal(instance.instanceId, "swe-9");
  assert.ok(instance.rawDiff.startsWith("diff --git"));

  const gt = instance.groundTruth[0]!;
  assert.equal(gt.file, "src/y.ts");
  assert.equal(gt.lineStart, 7); // coerced from "7"
  assert.equal(gt.lineEnd, 7);
  assert.equal(gt.description, "Handle the empty case."); // from message
  assert.equal(gt.severity, undefined);
});
