import { test } from "node:test";
import assert from "node:assert/strict";

import { BenchmarkLoader } from "../../src/campaign/index.ts";

test("loadQodo/loadSwe adapt raw payloads into datasets", () => {
  const loader = new BenchmarkLoader();
  const qodo = loader.loadQodo({
    rows: [{ id: "q1", diff: "d", issues: [{ file_path: "a.ts", line_start: 1 }] }],
  });
  const swe = loader.loadSwe({
    instances: [
      { instance_id: "s1", patch: "p", review_comments: [{ path: "b.ts", line: 2, body: "x" }] },
    ],
  });
  assert.equal(qodo.source, "qodo-pr-review-bench");
  assert.equal(swe.source, "swe-prbench");
  assert.equal(qodo.instances[0]!.instanceId, "q1");
  assert.equal(swe.instances[0]!.instanceId, "s1");
});

test("flatten preserves dataset then instance order", () => {
  const loader = new BenchmarkLoader();
  const qodo = loader.loadQodo({
    rows: [
      { id: "q1", diff: "d", issues: [] },
      { id: "q2", diff: "d", issues: [] },
    ],
  });
  const swe = loader.loadSwe({
    instances: [{ instance_id: "s1", patch: "p", review_comments: [] }],
  });

  const flat = loader.flatten([qodo, swe]);
  assert.deepEqual(
    flat.map((f) => f.instance.instanceId),
    ["q1", "q2", "s1"],
  );
  assert.equal(flat[0]!.datasetId, qodo.datasetId);
  assert.equal(flat[2]!.datasetId, swe.datasetId);
});
