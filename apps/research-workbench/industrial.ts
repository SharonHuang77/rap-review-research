// E3 industrial-study views. Presentation-only; renders rap-portal-report.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { table, escapeHtml } from "./render.ts";
import type { IndustrialReport } from "../../src/industrial/models.ts";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "rap-portal-report.json");
export function loadIndustrial(): IndustrialReport | null {
  try { return JSON.parse(readFileSync(DATA, "utf8")) as IndustrialReport; } catch { return null; }
}
const f3 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "—");
const pct = (n: number, d: number): string => (d > 0 ? `${((n / d) * 100).toFixed(0)}% (n=${d})` : "—");

interface LadderContrast {
  label: string; metric: string; armX: string; armY: string;
  meanX: number; meanY: number; medianDiff: number; wilcoxonP: number; cliff: number;
}

export function renderIndustrial(d: IndustrialReport): string {
  const perArm = table(["Architecture", "PRs", "Proxy-Precision", "Proxy-Recall", "Proxy-F1"],
    d.perArm.map((a) => [a.arm, a.n, f3(a.precision), f3(a.recall), f3(a.f1)]));
  const ladder = table(["Contrast", "Metric", "Arm X (mean)", "Arm Y (mean)", "Δ̃", "Wilcoxon p", "Cliff δ"],
    (d.ladder as LadderContrast[]).map((c) => [c.label, c.metric, `${c.armX} (${f3(c.meanX)})`, `${c.armY} (${f3(c.meanY)})`, f3(c.medianDiff), c.wilcoxonP < 1e-4 ? c.wilcoxonP.toExponential(1) : c.wilcoxonP.toFixed(4), f3(c.cliff)]));
  const depth = table(["Sources agreeing", "Same model ×runs", "Cross-family"],
    [1, 2, 3].map((k) => { const h = d.depth.hetero.find((r) => r.depth === k); const m = d.depth.homo.find((r) => r.depth === k); return [k, m ? pct(m.genuine, m.total) : "—", h ? pct(h.genuine, h.total) : "—"]; }));
  const cost = table(["Architecture", "LLM calls", "Messages", "Latency ms", "Cost $"],
    d.cost.map((c) => [c.arm, c.llmCalls, c.messageCount, c.latencyMs, c.estimatedCostUsd]));
  return `
  <p class="meta">Industrial case study (E3) · ${d.meta.prs.length} real portal PRs · ${d.meta.runsPerArm} runs/arm ·
     families ${d.meta.families.length} · judges ${escapeHtml(d.meta.judges.join(", "))} · κ=${d.judgeKappa == null ? "—" : d.judgeKappa.toFixed(3)}.
     ${escapeHtml(d.meta.note)}</p>
  <h2>Per-architecture proxy metrics (no human ground truth)</h2>${perArm}
  <h2>Ladder contrasts (proxy-F1, paired)</h2>${ladder}
  <h2>Cross-family judge-genuine by agreement depth (external validity)</h2>${depth}
  <h2>Cost & communication (captured live — the metrics E1/E2 did not persist)</h2>${cost}`;
}
export function industrialNotReady(): string {
  return `<p><strong>E3 report not generated yet.</strong></p><pre>npm run rap-portal:run   # live, paid
npm run rap-portal:static
npm run rap-portal:stats</pre>`;
}
