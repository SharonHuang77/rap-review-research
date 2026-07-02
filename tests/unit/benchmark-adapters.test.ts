import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QodoPRReviewBenchAdapter,
  SWEPRBenchAdapter,
  DatasetAdapterError,
} from "../../src/benchmark/index.ts";
import type { QodoRawDataset } from "../../src/benchmark/adapters/qodo-pr-review-bench-adapter.ts";
import type { SWEPRBenchDataset } from "../../src/benchmark/adapters/swe-prbench-adapter.ts";

test("Qodo adapter maps dataset rows into BenchmarkInstances", () => {
  const raw: QodoRawDataset = {
    dataset_id: "qodo-x",
    name: "Qodo X",
    rows: [
      {
        id: "row-1",
        pr_title: "Fix",
        diff: "diff --git a/a.ts b/a.ts\n",
        issues: [
          {
            file_path: "a.ts",
            line_start: 10,
            line_end: 12,
            category: "security",
            severity: "HIGH",
            title: "Injection",
            description: "bad",
          },
        ],
      },
    ],
  };

  const dataset = new QodoPRReviewBenchAdapter().toDataset(raw);
  assert.equal(dataset.source, "qodo-pr-review-bench");
  assert.equal(dataset.datasetId, "qodo-x");
  assert.equal(dataset.instances.length, 1);

  const instance = dataset.instances[0]!;
  assert.equal(instance.instanceId, "row-1");
  assert.equal(instance.title, "Fix");
  assert.ok(instance.rawDiff.startsWith("diff --git"));
  assert.equal(instance.groundTruth.length, 1);

  const gt = instance.groundTruth[0]!;
  assert.equal(gt.file, "a.ts");
  assert.equal(gt.lineStart, 10);
  assert.equal(gt.lineEnd, 12);
  assert.equal(gt.category, "security");
  assert.equal(gt.severity, "high"); // normalized from "HIGH"
});

test("Qodo adapter defaults line_end to line_start and generates issue ids", () => {
  const dataset = new QodoPRReviewBenchAdapter().toDataset({
    rows: [
      {
        id: "r",
        diff: "d",
        issues: [{ file_path: "x.ts", line_start: 5 }],
      },
    ],
  });
  const gt = dataset.instances[0]!.groundTruth[0]!;
  assert.equal(gt.lineEnd, 5);
  assert.equal(gt.id, "r-gt-0");
  assert.equal(gt.severity, undefined);
});

test("Qodo adapter rejects a dataset with no rows array", () => {
  assert.throws(
    () => new QodoPRReviewBenchAdapter().toDataset({} as QodoRawDataset),
    (e: unknown) => e instanceof DatasetAdapterError,
  );
});

test("SWE adapter maps review comments into ground-truth issues", () => {
  const raw: SWEPRBenchDataset = {
    name: "SWE X",
    instances: [
      {
        instance_id: "swe-42",
        title: "Null safety",
        patch: "diff --git a/c.ts b/c.ts\n",
        review_comments: [
          { path: "c.ts", line: 3, body: "Guard against null." },
          { path: "c.ts", line: 8, body: "x".repeat(120) },
        ],
      },
    ],
  };

  const dataset = new SWEPRBenchAdapter().toDataset(raw);
  assert.equal(dataset.source, "swe-prbench");
  const instance = dataset.instances[0]!;
  assert.equal(instance.instanceId, "swe-42");
  assert.equal(instance.groundTruth.length, 2);

  const first = instance.groundTruth[0]!;
  assert.equal(first.file, "c.ts");
  assert.equal(first.lineStart, 3);
  assert.equal(first.lineEnd, 3); // single-line comment
  assert.equal(first.severity, undefined); // human comments carry no severity
  assert.equal(first.category, undefined);
  assert.equal(first.description, "Guard against null.");

  // Long bodies are truncated for the title but preserved in the description.
  const second = instance.groundTruth[1]!;
  assert.ok(second.title!.endsWith("…"));
  assert.equal(second.description!.length, 120);
});

test("SWE adapter rejects a dataset with no instances array", () => {
  assert.throws(
    () => new SWEPRBenchAdapter().toDataset({} as SWEPRBenchDataset),
    (e: unknown) => e instanceof DatasetAdapterError,
  );
});
