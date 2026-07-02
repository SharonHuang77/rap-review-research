/**
 * Research Dashboard dev server (RFC-11 UI).
 *
 * A dependency-free `node:http` server that renders the Workbench view models
 * as plain HTML tables. It is presentation-only: it reads from the Workbench
 * and reuses the RFC-10 Export Service for downloads — it runs no experiments,
 * calls no LLM, and computes no metrics.
 *
 * Run with: `npm run dashboard` then open the printed URL.
 */
import { createServer } from "node:http";

import { buildSampleWorkbench } from "./sample-data.ts";
import { createExportService } from "../../src/export/index.ts";
import {
  layout,
  renderExperimentList,
  renderExperimentDetail,
  renderComparison,
  renderMetrics,
  renderReplay,
  renderExportHistory,
} from "./render.ts";
import { ExperimentNotFoundError } from "../../src/shared/errors.ts";

const PORT = Number(process.env.PORT ?? 4317);

const sample = await buildSampleWorkbench();
const { workbench, snapshotId, comparisons } = sample;
const exporter = createExportService();

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: string,
  contentType = "text/html; charset=utf-8",
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "content-type": contentType, ...headers });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const path = url.pathname;
    const q = url.searchParams;

    if (path === "/" || path === "/experiments") {
      const views = await workbench.getExperiments();
      return send(res, 200, layout("Experiments", renderExperimentList(views)));
    }

    if (path === "/experiment") {
      const id = q.get("id") ?? "";
      const view = await workbench.getExperiment(id);
      return send(res, 200, layout("Experiment Detail", renderExperimentDetail(view)));
    }

    if (path === "/comparison") {
      const snap = q.get("snapshot") ?? snapshotId;
      const view = await workbench.getComparison(snap);
      return send(res, 200, layout("Architecture Comparison", renderComparison(view)));
    }

    if (path === "/metrics") {
      const id = q.get("id") ?? "";
      const view = await workbench.getMetrics(id);
      return send(res, 200, layout("Metrics", renderMetrics(view)));
    }

    if (path === "/replay") {
      const id = q.get("id") ?? "";
      const view = await workbench.getReplay(id);
      return send(res, 200, layout("Conversation Replay", renderReplay(view)));
    }

    if (path === "/exports") {
      const view = await workbench.getExportHistory();
      return send(res, 200, layout("Export History", renderExportHistory(view)));
    }

    if (path === "/export") {
      const format = q.get("format") === "json" ? "json" : "csv";
      const result = await exporter.exportComparisons(
        { generatedAt: "2026-07-02T12:00:00.000Z", comparisons },
        format,
      );
      const contentType =
        format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
      return send(res, 200, result.content, contentType, {
        "content-disposition": `attachment; filename="${result.fileName}"`,
      });
    }

    return send(res, 404, layout("Not Found", `<p>No route for <code>${path}</code>.</p>`));
  } catch (error) {
    const status = error instanceof ExperimentNotFoundError ? 404 : 500;
    const message = error instanceof Error ? error.message : String(error);
    return send(res, status, layout("Error", `<p>${message}</p>`));
  }
});

server.listen(PORT, () => {
  console.log(`Research Dashboard running at http://localhost:${PORT}/`);
  console.log("Pages: /experiments  /comparison  /exports");
});
