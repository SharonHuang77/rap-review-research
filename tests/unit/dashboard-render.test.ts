import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  table,
  renderExperimentList,
  renderComparison,
  renderReplay,
  renderExportHistory,
} from "../../apps/research-workbench/render.ts";
import { buildSampleWorkbench } from "../../apps/research-workbench/sample-data.ts";

test("escapeHtml neutralizes HTML metacharacters", () => {
  assert.equal(escapeHtml('<a>"&\'</a>'), "&lt;a&gt;&quot;&amp;&#39;&lt;/a&gt;");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("table escapes cell content and shows an empty-state row", () => {
  const html = table(["A"], [["<script>"]]);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(table(["A", "B"], []).includes("No rows."));
});

test("sample workbench exposes all three architectures", async () => {
  const { workbench } = await buildSampleWorkbench();
  const list = await workbench.getExperiments();
  const architectures = list.map((e) => e.architecture).sort();
  assert.deepEqual(architectures, ["agentless", "consensus", "hierarchical"]);

  const html = renderExperimentList(list);
  assert.ok(html.includes("agentless"));
  assert.ok(html.includes("hierarchical"));
  assert.ok(html.includes("consensus"));
});

test("comparison view renders one row per architecture", async () => {
  const { workbench, snapshotId } = await buildSampleWorkbench();
  const view = await workbench.getComparison(snapshotId);
  assert.equal(view.architectures.length, 3);
  const html = renderComparison(view);
  assert.ok(html.includes("Architecture Comparison"));
  for (const arch of ["agentless", "hierarchical", "consensus"]) {
    assert.ok(html.includes(arch), `expected ${arch} in comparison`);
  }
});

test("replay view renders recorded multi-agent steps", async () => {
  const { workbench } = await buildSampleWorkbench();
  const list = await workbench.getExperiments();
  const hierarchical = list.find((e) => e.architecture === "hierarchical");
  assert.ok(hierarchical);
  const view = await workbench.getReplay(hierarchical!.experimentId);
  assert.ok(view.stepCount > 0);
  const html = renderReplay(view);
  assert.ok(html.includes("Replay Timeline"));
  assert.ok(html.includes("review-request"));
});

test("export history renders recorded exports and download buttons", async () => {
  const { workbench } = await buildSampleWorkbench();
  const view = await workbench.getExportHistory();
  assert.equal(view.csvCount, 1);
  assert.equal(view.jsonCount, 1);
  const html = renderExportHistory(view);
  assert.ok(html.includes("/export?format=csv"));
  assert.ok(html.includes("/export?format=json"));
});
