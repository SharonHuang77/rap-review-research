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
import {
  loadConfirmatory,
  renderOverview,
  renderContrasts,
  renderBenchmarks,
  renderCrossFamily,
  renderPrList,
  renderPrDetail,
  notReady,
} from "./confirmatory.ts";
import { loadIndustrial, renderIndustrial, industrialNotReady } from "./industrial.ts";

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

    // ---- Confirmatory results (authoritative; the real campaign data) --------
    const confirmatory = loadConfirmatory();
    const guard = (title: string, render: (d: NonNullable<typeof confirmatory>) => string): string =>
      confirmatory ? layout(title, render(confirmatory)) : layout(title, notReady());

    if (path === "/") {
      return send(res, 200, guard("Confirmatory Results", renderOverview));
    }
    if (path === "/contrasts") {
      return send(res, 200, guard("Paired Contrasts", renderContrasts));
    }
    if (path === "/benchmarks") {
      return send(res, 200, guard("SWE-PRBench Coverage", renderBenchmarks));
    }
    if (path === "/cross-family") {
      return send(res, 200, guard("Cross-Family Precision", renderCrossFamily));
    }
    if (path === "/prs") {
      return send(res, 200, guard("Browse PRs", renderPrList));
    }
    if (path === "/pr") {
      const id = q.get("id") ?? "";
      return send(res, 200, guard(`PR ${id}`, (d) => renderPrDetail(d, id)));
    }

    if (path === "/industrial") {
      const ind = loadIndustrial();
      return send(res, 200, layout("Industrial (E3)", ind ? renderIndustrial(ind) : industrialNotReady()));
    }

    // ---- Demo sample workbench (the original RFC-11 demo) --------------------
    if (path === "/experiments") {
      const views = await workbench.getExperiments();
      return send(res, 200, layout("Experiments (demo)", renderExperimentList(views)));
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
  console.log("Results: /  /contrasts  /benchmarks  /cross-family  /prs");
  console.log("Demo:    /experiments  /comparison  /exports");
  if (!loadConfirmatory()) {
    console.log("\n⚠  confirmatory-data.json not found — run `npm run dashboard:prep` first.");
  }
});
