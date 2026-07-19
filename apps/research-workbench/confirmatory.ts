/**
 * Confirmatory-results views for the Research Dashboard (RFC-11 UI).
 *
 * Presentation-only: renders the authoritative dataset produced by
 * `scripts/dashboard-prep.ts` (apps/research-workbench/confirmatory-data.json).
 * The per-arm P/R/F1 are the paper's frozen semantic-judge results, not a
 * re-derivation — this module computes nothing, it only formats.
 *
 * Regenerate the data with: `node scripts/dashboard-prep.ts`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { table, escapeHtml } from "./render.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "confirmatory-data.json");

const ARCHS = ["agentless", "generalists-3", "hierarchical", "consensus"] as const;

export interface ConfirmatoryData {
  meta: { tau: number; nRuns: number; instances: number; model: string; note: string };
  perArm: Array<{ arch: string; n: number; precision: number; recall: number; f1: number; fdr: number }>;
  ladder: Contrast[];
  h2: Contrast[];
  hVerify: Array<{ arm: string; k: number; meanVerified: number; meanBaseline: number; medianDiff: number; lo: number; hi: number; wilcoxonP: number; verdict: string }>;
  swe: { dataset: string; nRuns: number; family: Contrast[] };
  hetero: HeteroReport | null;
  prs: Array<{ instanceId: string; gtCount: number; arms: Record<string, PrArmCell | null> }>;
  prDetail: Record<string, { groundTruth: GtItem[]; arms: Record<string, Finding[]> }>;
}
interface Contrast {
  label: string; metric: string; armX: string; armY: string; n: number;
  meanX: number; meanY: number; medianDiff: number; diffLo: number; diffHi: number;
  wilcoxonP: number; cliff: number; holmP?: number;
}
interface PrArmCell { producedAvg: number; tp: number; fp: number; fn: number; precSem: number; recallSem: number; f1Sem: number }
interface GtItem { id?: string; file?: string; lineStart?: number; lineEnd?: number; category?: string; title?: string; description?: string }
interface Finding { id?: string; title?: string; severity?: string; category?: string; file?: string; line?: number; description?: string }
interface HeteroReport {
  testSet: { nPRs: number };
  claim1: { pooled: { heteroK2Precision: number; singleArmMean: number }; perPR: { n: number; precision: { meanHetero: number; meanSingleArm: number; meanDiff?: number; lo?: number; hi?: number; p?: number }; f1: { meanHetero: number; meanSingleArm: number } }; precisionMeets: boolean; f1EqualOrHigher: boolean };
  claim2: { heteroRate: number; homoRate: number; heteroN: number; homoN: number; gap: number; ci: number[]; meets: boolean };
  depthTable: { hetero: Array<{ depth: number; hit: number; total: number }>; homoAnchor: Array<{ depth: number; hit: number; total: number }> };
}

let cached: ConfirmatoryData | null = null;
export function loadConfirmatory(): ConfirmatoryData | null {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(DATA_PATH, "utf8")) as ConfirmatoryData;
    return cached;
  } catch {
    return null; // data not generated yet
  }
}

const f3 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "—");
const pct = (x: number): string => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
const p = (x: number): string => (x < 1e-4 ? x.toExponential(1) : x.toFixed(4));
const ci = (lo: number, hi: number): string => `[${f3(lo)}, ${f3(hi)}]`;

function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

export function notReady(): string {
  return `<p><strong>Confirmatory data not generated yet.</strong></p>
  <p>Sync the artifacts and build the dataset:</p>
  <pre>aws s3 sync s3://rap-review-research-data-106189426706/confirmatory/phase2-results/ phase2-results/
aws s3 sync s3://rap-review-research-data-106189426706/confirmatory/hetero-confirmatory/ hetero-confirmatory/
node scripts/dashboard-prep.ts</pre>`;
}

// ---- Results overview (paper §2) --------------------------------------------
export function renderOverview(d: ConfirmatoryData): string {
  const rows = d.perArm.map((a) => [
    a.arch, a.n, f3(a.precision), f3(a.recall), f3(a.f1), f3(a.fdr),
  ]);
  const best = d.perArm.reduce((m, a) => (a.f1 > m.f1 ? a : m));
  return `
  <p class="meta">Confirmatory campaign · <strong>${d.meta.nRuns}</strong> runs
    (${d.meta.instances} Qodo PRs × ${ARCHS.length} arms × 3) · SUT ${escapeHtml(d.meta.model)} ·
    semantic matching τ=${d.meta.tau}. ${escapeHtml(d.meta.note)}</p>
  <h2>Per-arm review quality (macro over PRs, semantic judge)</h2>
  ${table(["Architecture", "PRs (n)", "Precision", "Recall", "F1", "FDR"], rows)}
  <p><strong>${escapeHtml(best.arch)}</strong> is F1-dominant (${f3(best.f1)}). More agents buy
     recall but not quality: precision falls and FDR rises as fan-out grows.</p>
  <p>Detail: ${link("/contrasts", "paired significance (ladder / H2 / H-verify)")} ·
     ${link("/benchmarks", "SWE-PRBench coverage")} ·
     ${link("/cross-family", "cross-family precision")} ·
     ${link("/prs", "browse all 99 PRs")}.</p>`;
}

function contrastRows(cs: Contrast[]): unknown[][] {
  return cs.map((c) => [
    c.label, c.metric, `${c.armX} (${f3(c.meanX)})`, `${c.armY} (${f3(c.meanY)})`,
    f3(c.medianDiff), ci(c.diffLo, c.diffHi), p(c.wilcoxonP), c.holmP !== undefined ? p(c.holmP) : "—", f3(c.cliff),
  ]);
}
const CONTRAST_HEAD = ["Contrast", "Metric", "Arm X (mean)", "Arm Y (mean)", "Δ̃ median", "95% CI", "Wilcoxon p", "Holm p", "Cliff δ"];

// ---- Contrasts (ladder / H2 / H-verify) -------------------------------------
export function renderContrasts(d: ConfirmatoryData): string {
  const hv = d.hVerify.map((h) => [
    h.arm, h.k, f3(h.meanVerified), f3(h.meanBaseline), f3(h.medianDiff), ci(h.lo, h.hi), p(h.wilcoxonP), h.verdict,
  ]);
  return `
  <h2>Recall / F1 ladder (paired, Holm-adjusted within family)</h2>
  ${table(CONTRAST_HEAD, contrastRows(d.ladder))}
  <h2>H2 primary — hierarchical vs generalists-3</h2>
  ${table(CONTRAST_HEAD, contrastRows(d.h2))}
  <p>H2 (specialization) is <strong>NULL</strong>: hierarchical and generalists-3 reach the same
     recall at comparable precision — the recall gain is from more agents, not the manager topology.</p>
  <h2>H-verify — self-consistency rescue (keep findings recurring in ≥k of 3 runs)</h2>
  ${table(["Arm", "k", "Verified F1", "Baseline F1", "Δ̃", "95% CI", "Wilcoxon p", "Verdict"], hv)}
  <p>Does not replicate the pilot: verified F1 stays below the Agentless baseline.</p>`;
}

// ---- SWE-PRBench -------------------------------------------------------------
export function renderBenchmarks(d: ConfirmatoryData): string {
  return `
  <p class="meta">${escapeHtml(d.swe.dataset)} · ${d.swe.nRuns} runs (50 PRs × 4 arms × 3) ·
     semantic coverage of human review comments.</p>
  <h2>Coverage vs Agentless (paired, Holm-adjusted)</h2>
  ${table(CONTRAST_HEAD, contrastRows(d.swe.family))}
  <p>Coverage rises with more agents, but F1 is a four-way tie — the extra agents surface more,
     not better.</p>`;
}

// ---- Cross-family precision -------------------------------------------------
export function renderCrossFamily(d: ConfirmatoryData): string {
  if (!d.hetero) return `<p>No cross-family report available.</p>`;
  const h = d.hetero;
  const c1 = h.claim1, c2 = h.claim2;
  const depth = [1, 2, 3].map((k) => {
    const het = h.depthTable.hetero.find((r) => r.depth === k);
    const hom = h.depthTable.homoAnchor.find((r) => r.depth === k);
    const rate = (r?: { hit: number; total: number }): string => (r ? `${pct(r.hit / r.total)} (n=${r.total})` : "—");
    return [k, rate(hom), rate(het)];
  });
  return `
  <p class="meta">Test set: ${h.testSet.nPRs}-PR disjoint remainder · agentless reviews by
     distinct model families (Kimi K2.5, GLM-5) vs the frozen SUT.</p>
  <h2>Claim ① — ≥2-family agreement raises precision</h2>
  ${table(["", "≥2-family (hetero)", "Single-arm mean", "Verdict"], [
    ["Precision (per-PR, n=" + c1.perPR.n + ")", f3(c1.perPR.precision.meanHetero), f3(c1.perPR.precision.meanSingleArm), c1.precisionMeets ? "CONFIRMED" : "not met"],
    ["F1 (equal-or-higher)", f3(c1.perPR.f1.meanHetero), f3(c1.perPR.f1.meanSingleArm), c1.f1EqualOrHigher ? "yes" : "no"],
  ])}
  <h2>Claim ② — all-3-family agreement vs same-model self-recurrence</h2>
  ${table(["Golden-match rate", "Rate", "n", "Gap [95% CI]"], [
    ["All-3 cross-family", pct(c2.heteroRate), c2.heteroN, `+${f3(c2.gap)} ${ci(c2.ci[0]!, c2.ci[1]!)}`],
    ["Same model ×3 runs", pct(c2.homoRate), c2.homoN, ""],
  ])}
  <h2>Golden-match rate by corroboration depth</h2>
  ${table(["Sources agreeing", "Same model ×3 runs", "Cross-family ×3"], depth)}
  <p>The trustworthy signal is cross-family agreement, not a single model repeating itself.</p>`;
}

// ---- PR browser -------------------------------------------------------------
export function renderPrList(d: ConfirmatoryData): string {
  const head = ["PR", "GT", ...ARCHS.map((a) => `${a} F1`)].map((x) => `<th>${escapeHtml(x)}</th>`).join("");
  const body = d.prs
    .map((row) => {
      const cells = [
        link(`/pr?id=${encodeURIComponent(row.instanceId)}`, row.instanceId),
        String(row.gtCount),
        ...ARCHS.map((a) => (row.arms[a] ? f3(row.arms[a]!.f1Sem) : "—")),
      ];
      return `<tr><td>${cells[0]}</td>${cells.slice(1).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `
  <p class="meta">${d.prs.length} Qodo PRs. F1 = semantic, averaged over 3 runs. Click a PR for its
     ground-truth defects and each arm's findings.</p>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderPrDetail(d: ConfirmatoryData, instanceId: string): string {
  const detail = d.prDetail[instanceId];
  const row = d.prs.find((r) => r.instanceId === instanceId);
  if (!detail || !row) return `<p>PR <code>${escapeHtml(instanceId)}</code> not found. ${link("/prs", "← all PRs")}</p>`;
  const gt = table(
    ["#", "File", "Lines", "Category", "Title"],
    detail.groundTruth.map((g, i) => [i + 1, g.file ?? "—", g.lineStart != null ? `${g.lineStart}–${g.lineEnd ?? g.lineStart}` : "—", g.category ?? "—", g.title ?? g.description ?? "—"]),
  );
  const armBlocks = ARCHS.map((a) => {
    const cell = row.arms[a];
    const findings = detail.arms[a] ?? [];
    const summary = cell
      ? `P ${f3(cell.precSem)} · R ${f3(cell.recallSem)} · F1 ${f3(cell.f1Sem)} · TP ${cell.tp} / FP ${cell.fp} / FN ${cell.fn}`
      : "no data";
    const t = table(
      ["Severity", "Category", "File:Line", "Title"],
      findings.map((f) => [f.severity ?? "—", f.category ?? "—", `${f.file ?? "?"}:${f.line ?? "?"}`, f.title ?? "—"]),
    );
    return `<h3>${escapeHtml(a)} <span class="meta">— ${escapeHtml(summary)}</span></h3>${t}`;
  }).join("");
  return `
  <p>${link("/prs", "← all PRs")} · <strong>${escapeHtml(instanceId)}</strong> · ${detail.groundTruth.length} ground-truth defect(s)</p>
  <h2>Ground truth</h2>${gt}
  <h2>Findings by architecture <span class="meta">(first of 3 runs; metrics are the 3-run average)</span></h2>${armBlocks}`;
}
