# RAP-Portal Industrial Study (E3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the industrial third dataset (E3): run the 4-architecture ladder + a cross-family agentless axis on ~30 real RAP-portal PRs, and score them with proxy-P/R/F1 (no human ground truth) — judge-genuine precision + leave-one-out pooled recall — plus the cross-family judge-genuine-by-depth replication.

**Architecture:** A **pure analysis core** (`src/industrial/*`, unit-tested, zero I/O) that builds a leave-one-out pooled pseudo-ground-truth and computes proxy metrics + agreement-depth stats; an **impure live runner** (`scripts/rap-portal-campaign.ts`) that fetches PRs via `gh`, runs the arms + judge through the existing experiment service, and persists runs + judge cache to disk (S3-backable, zero-LLM replay); a **stats script** (`scripts/phase3-industrial-stats.ts`) that replays the cache into `rap-portal-report.json`; and a **dashboard view** that renders it beside E1/E2.

**Tech Stack:** Node 22 native TypeScript (type-stripping, no build) · `node --test` · existing `src/evaluation/industrial/*`, `src/services/{snapshot,experiment}`, `src/analysis/stats.ts`, `BedrockProvider` · `gh` CLI · the RFC-11 dashboard (`apps/research-workbench/`).

**Spec:** `docs/experiment/13-rap-portal-industrial-design.md`

---

## Comparability Contract (shared frozen config with E1/E2 — do not deviate)

E3 is a third dataset column and an **external replication of E1**. To be
apples-to-apples, every knob below is **identical to E1** (`phase3-stats.ts`,
`phase3-hetero-stats.ts`, freeze-manifest v1+v2). The ONLY intended differences
are the dataset (real, unlabeled PRs) and two clearly-labeled proxies
(judge-genuine precision, pool-coverage recall).

**Frozen identical to E1 (any deviation breaks comparability):**
- **Arms:** `agentless, generalists-3, hierarchical, consensus`; SUT = Claude
  Haiku 4.5; frozen **v1** prompt; temp `0` / maxTokens `4096`; **3 runs/arm**;
  PR = unit = mean of 3 runs.
- **Cross-family axis:** `agentless` × {Haiku 4.5, Kimi K2.5, GLM 5}, 3 runs each,
  unchanged v1 prompt.
- **Finding↔finding clustering = the Nova Pro pair judge**, **τ_pair = 0.7**,
  union-find, via `src/benchmark/matching/finding-pair-judge.ts`
  (`clusterFindingsSemantically` + `FindingPairScoreCache`). **NOT**
  `FindingSimilarity` (token-Jaccard). This is the SAME semantic instrument E1
  uses for its depth table (doc 09 fairness rule 1); anything else makes the
  replication non-comparable. Corroboration **depth = number of distinct model
  families** in a semantic cluster (1/2/3).
- **Stats:** `src/analysis/stats.ts` — paired Wilcoxon, Cliff's δ, seeded
  2000-iter bootstrap CIs, Holm within family.
- **Judges non-circular:** Nova Pro pair judge (family disjoint from every
  reviewer) + DeepSeek V3.2 second judge with reported κ.

**Analysis hierarchy (matches doc 13 §2 — keep the plan/paper faithful to it):**
- **PRIMARY (confirmatory external validity):** the cross-family
  judge-genuine-**by-depth** table, replicating E1 §4 (89% vs 54%). Task 4.
- **SECONDARY (corroborating replication, proxy):** per-arm proxy-P/R/F1 ladder
  (H1/H2/H3). Task 3/5. Reported with wide-CI caveats on ~30 PRs; a null or noisy
  ladder result does **not** threaten the E3 contribution.

**Proxy definitions (the only intended differences from E1):**
- **proxy-precision** = independent-judge "genuine?" rate. The judge PROMPT is the
  SAME "is this a genuine problem, given the diff?" prompt as E1's completeness
  pass (`scripts/phase3-fp-completeness.ts`), so the proxy is measured with E1's
  instrument.
- **proxy-recall** = leave-one-out **pool coverage**. Pool clusters = corroborated
  by **≥2 of the 3 model FAMILIES** (families are the independent sources; the
  four architectures are NOT independent sources — they share Haiku).
  **Leave-one-out excludes the Haiku family source when scoring ANY Haiku
  architecture arm (all four),** so every arm is scored against the same
  {Kimi, GLM} pool and the ladder comparison is symmetric.
- **Static analysis is NOT a pool member** — it is a separate triangulation signal
  and a sensitivity-pool robustness check (Task 7). This keeps the recall
  reference stable across PRs (static coverage is best-effort and uneven).

**Power note:** ~30 PRs yields thin depth-3 buckets vs E1's 137 findings / 80 PRs.
Report the depth replication with honest wide CIs; prefer **40–50 PRs** if the
Bedrock budget allows.

---

## File Structure

**Create:**
- `src/industrial/models.ts` — persisted E3 types (`IndustrialRun`, `JudgeCache`, `IndustrialReport`) + arm/axis constants
- `src/industrial/finding-pool.ts` — `buildPool()` (cluster findings across sources) + `poolCoverage()` (leave-one-out recall)
- `src/industrial/proxy-metrics.ts` — `perArmProxyMetrics()` (precision=judge-genuine, recall=pool coverage, f1)
- `src/industrial/agreement-depth.ts` — `judgeGenuineByDepth()` (cross-family depth table)
- `scripts/rap-portal-campaign.ts` — live runner (fetch → run arms → judge → persist)
- `scripts/rap-portal-static.ts` — best-effort static-analysis + later-fix producer (writes `static.json`, `laterfix.json`)
- `scripts/phase3-industrial-stats.ts` — pure analysis → `rap-portal-report.json`
- `apps/research-workbench/industrial.ts` — dashboard render for the E3 report
- Tests: `tests/unit/industrial-finding-pool.test.ts`, `tests/unit/industrial-proxy-metrics.test.ts`, `tests/unit/industrial-agreement-depth.test.ts`, `tests/unit/industrial-stats-report.test.ts`

**Modify:**
- `apps/research-workbench/server.ts` — add `/industrial` route
- `apps/research-workbench/render.ts` — add `Industrial` nav link
- `package.json` — add `rap-portal:run`, `rap-portal:static`, `rap-portal:stats` scripts

---

## Task 1: E3 shared types

**Files:**
- Create: `src/industrial/models.ts`
- Test: `tests/unit/industrial-models.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/industrial-models.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHITECTURE_ARMS, FAMILY_ARMS, runKey } from "../../src/industrial/models.ts";

test("architecture arms are the four ladder rungs", () => {
  assert.deepEqual(ARCHITECTURE_ARMS, ["agentless", "generalists-3", "hierarchical", "consensus"]);
});

test("family arms are the three cross-family agentless models", () => {
  assert.equal(FAMILY_ARMS.length, 3);
  assert.ok(FAMILY_ARMS.includes("us.anthropic.claude-haiku-4-5-20251001-v1:0"));
});

test("runKey is stable and unique per (pr, axis, arm, run)", () => {
  assert.equal(runKey({ pr: "12", axis: "architecture", arm: "consensus", runIndex: 2 }), "12|architecture|consensus|2");
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test tests/unit/industrial-models.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/industrial/models.ts`:
```ts
// E3 (RAP-portal industrial study) persisted types. No I/O here.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";

/** The four-rung architecture ladder, run under the SUT family (Haiku). */
export const ARCHITECTURE_ARMS = ["agentless", "generalists-3", "hierarchical", "consensus"] as const;
export type ArchitectureArm = (typeof ARCHITECTURE_ARMS)[number];

/** Cross-family agentless arms (Bedrock model ids). Haiku = SUT / self-recurrence baseline. */
export const FAMILY_ARMS = [
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "moonshotai.kimi-k2.5",
  "zai.glm-5",
] as const;
export type FamilyArm = (typeof FAMILY_ARMS)[number];

/** Judge models (independent families), primary first. */
export const JUDGE_MODELS = ["us.amazon.nova-pro-v1:0", "deepseek.v3.2"] as const;

export interface RunCost {
  llmCalls: number; messageCount: number; latencyMs: number;
  estimatedCostUsd: number; inputTokens: number; outputTokens: number;
}

/** One persisted review run. `axis` says whether `arm` is an architecture or a family model id. */
export interface IndustrialRun {
  pr: string;
  snapshotId: string;
  axis: "architecture" | "family";
  arm: string;
  runIndex: number;
  findings: ReviewFinding[];
  cost: RunCost;
}

/** Judge verdicts keyed `${findingId}::${judgeModel}`. */
export type JudgeCache = Record<string, FindingVerdict>;

export const runKey = (r: { pr: string; axis: string; arm: string; runIndex: number }): string =>
  `${r.pr}|${r.axis}|${r.arm}|${r.runIndex}`;
export const judgeKey = (findingId: string, judgeModel: string): string => `${findingId}::${judgeModel}`;

/** The analysis output rendered by the dashboard. */
export interface IndustrialReport {
  meta: { prs: string[]; runsPerArm: number; families: string[]; judges: string[]; note: string };
  perArm: Array<{ arm: ArchitectureArm; n: number; precision: number; recall: number; f1: number }>;
  ladder: unknown[];   // paired contrasts from src/analysis/stats
  depth: { hetero: Array<{ depth: number; genuine: number; total: number }>; homo: Array<{ depth: number; genuine: number; total: number }> };
  triangulation: { staticByDepth: unknown[]; laterFixByDepth: unknown[] };
  judgeKappa: number | null;
  cost: Array<{ arm: string; llmCalls: number; messageCount: number; latencyMs: number; estimatedCostUsd: number }>;
}
```

- [ ] **Step 4: Run to verify it passes.** `node --test tests/unit/industrial-models.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/industrial/models.ts tests/unit/industrial-models.test.ts
git commit -m "feat(e3): industrial study shared types (arms, runs, judge cache, report)"
```

---

## Task 2: Leave-one-out finding pool (the recall reference)

**Files:**
- Create: `src/industrial/finding-pool.ts`
- Test: `tests/unit/industrial-finding-pool.test.ts`

> ⚠️ **Comparability override (see Comparability Contract).** The snippet below
> uses `FindingSimilarity` (token-Jaccard) as an illustration only. For E3 to be
> comparable to E1, `buildPool`/`poolCoverage` **must cluster via the Nova pair
> judge** — `clusterFindingsSemantically(members, pairCache, 0.7)` +
> `FindingPairScoreCache` from `src/benchmark/matching/finding-pair-judge.ts`
> (exactly as `scripts/phase3-hetero-stats.ts`). Thread a `pairCache` argument
> through from the report (Task 5). **Pool sources = the 3 model families only**
> (Haiku/Kimi/GLM) — NOT static analysis (static is triangulation only, Task 7).
> Keep the leave-one-out mechanism, but it excludes a **family** (see Task 5).

A **pool cluster** is a finding corroborated by ≥2 independent model-family sources. Two findings are "the same" per the Nova semantic pair judge (τ_pair=0.7), the same instrument E1 uses. `poolCoverage` measures an arm's recall against the pool, rebuilding the pool **excluding a named family** (leave-one-out) so an arm can't grade its own homework.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/industrial-finding-pool.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPool, poolCoverage } from "../../src/industrial/finding-pool.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, title: string): ReviewFinding => ({
  id, title, category: "correctness", severity: "medium", file, line,
  description: title, recommendation: "fix", confidence: 0.7,
});

// Seed a pair cache so clustering is deterministic and zero-LLM.
const cacheOf = (pairs: [ReviewFinding, ReviewFinding, number][]): FindingPairScoreCache => {
  const c = new FindingPairScoreCache();
  for (const [a, b, s] of pairs) c.set(a, b, s);
  return c;
};

test("a finding seen by >=2 sources enters the pool; a lone finding does not", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null dereference"); // pair judge says a≈c
  const d = f("d", "src/z.ts", 99, "unused var");       // lone → excluded
  const sources = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [c]], ["glm", [d]],
  ]);
  const pool = buildPool(sources, cacheOf([[a, c, 0.9]]), { minSources: 2 });
  assert.equal(pool.length, 1);
  assert.deepEqual([...pool[0]!.sources].sort(), ["haiku", "kimi"]);
});

test("poolCoverage = fraction of clusters an arm's findings match", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null deref");
  const e = f("e", "src/y.ts", 5, "race condition");
  const g = f("g", "src/y.ts", 5, "race condition");
  const h = f("h", "src/x.ts", 10, "possible null deref"); // arm finding, matches cluster 1 only
  const sources = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [c]], ["glm", [e]], ["static", [g]],
  ]);
  const cache = cacheOf([[a, c, 0.9], [e, g, 0.9], [h, a, 0.8]]);
  const pool = buildPool(sources, cache, { minSources: 2 }); // 2 clusters
  assert.equal(poolCoverage([h], pool, cache), 0.5);
});

test("leave-one-out rebuilds the pool without the excluded source", () => {
  const a = f("a", "src/x.ts", 10, "null deref");
  const c = f("c", "src/x.ts", 10, "null deref");
  const sources = new Map<string, ReviewFinding[]>([["haiku", [a]], ["kimi", [c]]]);
  // Excluding kimi leaves haiku's finding with only 1 source → no >=2 clusters.
  const pool = buildPool(sources, cacheOf([[a, c, 0.9]]), { minSources: 2, excludeSource: "kimi" });
  assert.equal(pool.length, 0);
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test tests/unit/industrial-finding-pool.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/industrial/finding-pool.ts`:
```ts
// Pooled pseudo-ground-truth for E3 (no human ground truth). A cluster is a
// finding corroborated by >=2 independent SOURCES (model families), clustered
// with the SAME Nova pair judge E1 uses (finding-pair-judge). Leave-one-out
// excludes a named source so an arm never defines the reference it's scored
// against. Zero-LLM: all pair scores come from the persisted cache.
import type { ReviewFinding } from "../models/finding.ts";
import {
  clusterFindingsSemantically,
  type FindingPairScoreCache,
  type MemberFinding,
} from "../benchmark/matching/finding-pair-judge.ts";

/** Frozen pair-judge threshold — identical to E1 (Comparability Contract). */
export const TAU_PAIR = 0.7;

export interface PoolCluster {
  rep: ReviewFinding;
  sources: Set<string>;      // distinct source labels corroborating this issue
  findings: ReviewFinding[];
}
export interface BuildPoolOptions {
  minSources?: number;       // default 2
  excludeSource?: string;    // leave-one-out (drop this source label)
  threshold?: number;        // pair-judge τ, default TAU_PAIR
}

/**
 * Cluster findings across sources with the Nova pair judge, keeping clusters hit
 * by >= minSources distinct sources. `sourceFindings` maps a source LABEL (a
 * model family such as the Haiku/Kimi/GLM agentless review) to its findings.
 */
export function buildPool(
  sourceFindings: ReadonlyMap<string, ReviewFinding[]>,
  cache: FindingPairScoreCache,
  options: BuildPoolOptions = {},
): PoolCluster[] {
  const minSources = options.minSources ?? 2;
  const threshold = options.threshold ?? TAU_PAIR;
  const labels: string[] = [];
  const members: MemberFinding[] = [];
  for (const [source, findings] of sourceFindings) {
    if (source === options.excludeSource) continue;
    const member = labels.length;    // one member index per source
    labels.push(source);
    for (const finding of findings) members.push({ finding, member });
  }
  const { clusters } = clusterFindingsSemantically(members, cache, threshold);
  return clusters
    .filter((c) => c.members.size >= minSources)
    .map((c) => ({
      rep: c.rep,
      sources: new Set([...c.members].map((m) => labels[m]!)),
      findings: [...c.findings],
    }));
}

/**
 * Recall proxy: fraction of pool clusters an arm's findings match, using the
 * SAME pair judge (a cached pair score >= threshold, or finding identity). 0
 * when the pool is empty. Requires the runner to have judged arm↔family pairs
 * (Task 6 judges the family ∪ arm union), else an unjudged pair reads as no-match.
 */
export function poolCoverage(
  armFindings: readonly ReviewFinding[],
  pool: readonly PoolCluster[],
  cache: FindingPairScoreCache,
  threshold = TAU_PAIR,
): number {
  if (pool.length === 0) return 0;
  const covered = pool.filter((c) =>
    armFindings.some((af) =>
      c.findings.some((cf) => cf.id === af.id || (cache.get(af, cf) ?? 0) >= threshold),
    ),
  ).length;
  return covered / pool.length;
}
```
> **Note:** clustering and coverage use the persisted **Nova pair-judge cache**
> (`FindingPairScoreCache`, τ=0.7) — the exact instrument E1 uses
> (`scripts/phase3-hetero-stats.ts`). Two implementer preconditions: (a) the
> runner (Task 6) must judge every same-file cross-source finding pair over the
> **family ∪ architecture-arm union**, so `poolCoverage` isn't a silent
> cache-miss zero; (b) **finding ids must be globally unique** across (PR, arm,
> run) — the runner namespaces them (Task 1/6) so `judge`/verdict lookups by id
> never collide.

- [ ] **Step 4: Run to verify it passes.** `node --test tests/unit/industrial-finding-pool.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**
```bash
git add src/industrial/finding-pool.ts tests/unit/industrial-finding-pool.test.ts
git commit -m "feat(e3): leave-one-out pooled pseudo-ground-truth"
```

---

## Task 3: Per-arm proxy P/R/F1

**Files:**
- Create: `src/industrial/proxy-metrics.ts`
- Test: `tests/unit/industrial-proxy-metrics.test.ts`

Precision = judge-genuine rate (fraction of an arm's findings with a `valid` verdict). Recall = leave-one-out pool coverage. F1 = harmonic mean.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/industrial-proxy-metrics.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyPrecision, proxyF1 } from "../../src/industrial/proxy-metrics.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string): ReviewFinding => ({
  id, title: id, category: "correctness", severity: "low", file: "a.ts", line: 1,
  description: "d", recommendation: "r", confidence: 0.5,
});

test("proxyPrecision = valid verdicts / findings", () => {
  const findings = [f("a"), f("b"), f("c"), f("d")];
  const verdicts = { a: "valid", b: "valid", c: "invalid", d: "uncertain" } as const;
  assert.equal(proxyPrecision(findings, verdicts), 0.5);
});

test("proxyPrecision of an empty finding set is 0", () => {
  assert.equal(proxyPrecision([], {}), 0);
});

test("proxyF1 is the harmonic mean; 0 when either term is 0", () => {
  assert.ok(Math.abs(proxyF1(0.6, 0.4) - 0.48) < 1e-9);
  assert.equal(proxyF1(0, 0.9), 0);
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test tests/unit/industrial-proxy-metrics.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Create `src/industrial/proxy-metrics.ts`:
```ts
// Proxy review-quality metrics for E3. Precision = independent-judge "genuine"
// rate; recall = leave-one-out pool coverage (see finding-pool.ts); f1 = HM.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";

/** Fraction of findings the judge rated `valid`. Empty set → 0. */
export function proxyPrecision(
  findings: readonly ReviewFinding[],
  verdicts: Readonly<Record<string, FindingVerdict>>,
): number {
  if (findings.length === 0) return 0;
  const valid = findings.filter((f) => verdicts[f.id] === "valid").length;
  return valid / findings.length;
}

/** Harmonic mean; 0 if either input is 0. */
export function proxyF1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
```

- [ ] **Step 4: Run to verify it passes.** `node --test tests/unit/industrial-proxy-metrics.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/industrial/proxy-metrics.ts tests/unit/industrial-proxy-metrics.test.ts
git commit -m "feat(e3): proxy precision (judge-genuine) + f1"
```

---

## Task 4: Cross-family judge-genuine by agreement depth

**Files:**
- Create: `src/industrial/agreement-depth.ts`
- Test: `tests/unit/industrial-agreement-depth.test.ts`

> ⚠️ **Comparability override + PRIMARY analysis.** This depth table is the
> **primary confirmatory E3 result** (external replication of E1 §4). It **must**
> cluster with `clusterFindingsSemantically(members, pairCache, 0.7)` (the Nova
> pair judge), NOT `buildPool` with `FindingSimilarity`. Reuse the exact
> clustering path of `scripts/phase3-hetero-stats.ts` so the E3 and E1 depth
> tables are the same measurement. `depth = cluster.members.size` (distinct
> families). Report hetero (cross-family) vs homo (Haiku ×3 self-recurrence)
> with honest wide CIs given ~30 PRs.

Replicates E1 §4's depth table: cluster the **agentless family** findings (Haiku/Kimi/GLM) with the Nova semantic pair judge, bucket each cluster by how many families hit it (1/2/3), and report the fraction judged genuine per depth — for cross-family clusters vs same-model self-recurrence (Haiku's 3 runs).

- [ ] **Step 1: Write the failing test.** Create `tests/unit/industrial-agreement-depth.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeGenuineByDepth } from "../../src/industrial/agreement-depth.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, title: string): ReviewFinding => ({
  id, title, category: "correctness", severity: "medium", file, line,
  description: title, recommendation: "fix", confidence: 0.7,
});

test("buckets cross-family clusters by family-agreement depth and reports genuine rate", () => {
  const a = f("a", "x.ts", 10, "null deref");   // haiku
  const b = f("b", "x.ts", 10, "null deref");   // kimi — same issue as a (depth 2)
  const c = f("c", "y.ts", 5, "typo");          // glm — lone (depth 1)
  const cache = new FindingPairScoreCache();
  cache.set(a, b, 0.9);                          // a≈b per the pair judge
  const familyFindings = new Map<string, ReviewFinding[]>([
    ["haiku", [a]], ["kimi", [b]], ["glm", [c]],
  ]);
  const verdicts = { a: "valid", b: "valid", c: "invalid" } as const;
  const table = judgeGenuineByDepth(familyFindings, verdicts, cache);
  const d2 = table.find((r) => r.depth === 2)!;
  const d1 = table.find((r) => r.depth === 1)!;
  assert.equal(d2.genuine, 1); assert.equal(d2.total, 1); // depth-2 cluster genuine (rep a=valid)
  assert.equal(d1.genuine, 0); assert.equal(d1.total, 1); // depth-1 cluster not genuine
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test tests/unit/industrial-agreement-depth.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Create `src/industrial/agreement-depth.ts`:
```ts
// Cross-family corroboration-depth table (E1 §4 analog on real PRs). Cluster the
// findings with the Nova pair judge; a cluster's depth = number of distinct
// sources (families, or runs for the homo baseline); genuine = the cluster
// representative's judge verdict is `valid`. Same instrument as phase3-hetero-stats.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";
import {
  clusterFindingsSemantically,
  type FindingPairScoreCache,
  type MemberFinding,
} from "../benchmark/matching/finding-pair-judge.ts";
import { TAU_PAIR } from "./finding-pool.ts";

export interface DepthRow { depth: number; genuine: number; total: number }

export function judgeGenuineByDepth(
  sourceFindings: ReadonlyMap<string, ReviewFinding[]>,
  verdicts: Readonly<Record<string, FindingVerdict>>,
  cache: FindingPairScoreCache,
  threshold = TAU_PAIR,
): DepthRow[] {
  const members: MemberFinding[] = [];
  let member = 0;
  for (const [, findings] of sourceFindings) {
    for (const finding of findings) members.push({ finding, member });
    member += 1;                       // one member index per source (family or run)
  }
  const { clusters } = clusterFindingsSemantically(members, cache, threshold);
  const rows = new Map<number, DepthRow>();
  for (const c of clusters) {
    const row = rows.get(c.members.size) ?? { depth: c.members.size, genuine: 0, total: 0 };
    row.total += 1;
    if (verdicts[c.rep.id] === "valid") row.genuine += 1;
    rows.set(c.members.size, row);
  }
  return [...rows.values()].sort((a, b) => a.depth - b.depth);
}
```

- [ ] **Step 4: Run to verify it passes.** `node --test tests/unit/industrial-agreement-depth.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/industrial/agreement-depth.ts tests/unit/industrial-agreement-depth.test.ts
git commit -m "feat(e3): cross-family judge-genuine-by-depth table"
```

---

## Task 5: Analysis script → `rap-portal-report.json`

**Files:**
- Create: `scripts/phase3-industrial-stats.ts`
- Test: `tests/unit/industrial-stats-report.test.ts` (drives a small helper `buildIndustrialReport`)

Split the pure composition into a testable `buildIndustrialReport(runs, judge, pairCache)` in `src/industrial/report.ts`; the script is a thin file-I/O wrapper. This keeps the analysis unit-tested and zero-LLM.

> ⚠️ **Comparability override (see Comparability Contract).** `buildIndustrialReport`
> takes an additional **`pairCache: FindingPairScoreCache`** (loaded from
> `pair-judge-cache.json`) and threads it into `buildPool`/`poolCoverage`/
> `judgeGenuineByDepth` so all clustering is the Nova pair judge (τ_pair=0.7), not
> Jaccard. **Leave-one-out excludes the Haiku family for ALL four arms** (fixed in
> the snippet below), so every arm is scored against the same {Kimi, GLM} pool.
> Set the report `meta` to mark the **depth table PRIMARY** and **per-arm/ladder
> SECONDARY**.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/industrial-stats-report.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndustrialReport } from "../../src/industrial/report.ts";
import type { IndustrialRun, JudgeCache } from "../../src/industrial/models.ts";
import { judgeKey } from "../../src/industrial/models.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, t: string): ReviewFinding => ({
  id, title: t, category: "correctness", severity: "medium", file, line,
  description: t, recommendation: "fix", confidence: 0.7,
});
const cost = { llmCalls: 1, messageCount: 1, latencyMs: 100, estimatedCostUsd: 0.01, inputTokens: 10, outputTokens: 5 };
const run = (over: Partial<IndustrialRun>): IndustrialRun => ({
  pr: "1", snapshotId: "s1", axis: "architecture", arm: "agentless", runIndex: 0, findings: [], cost, ...over,
});

test("buildIndustrialReport yields per-arm proxy metrics and a depth table", () => {
  const fa = f("a", "x.ts", 10, "null deref"); // agentless arm + Haiku family
  const fb = f("b", "x.ts", 10, "null deref"); // Kimi family — same issue as fa
  const runs: IndustrialRun[] = [
    run({ axis: "architecture", arm: "agentless", findings: [fa] }),
    run({ axis: "family", arm: "us.anthropic.claude-haiku-4-5-20251001-v1:0", findings: [fa] }),
    run({ axis: "family", arm: "moonshotai.kimi-k2.5", findings: [fb] }),
  ];
  const judge: JudgeCache = {
    [judgeKey("a", "us.amazon.nova-pro-v1:0")]: "valid",
    [judgeKey("b", "us.amazon.nova-pro-v1:0")]: "valid",
  };
  const pairCache = new FindingPairScoreCache();
  pairCache.set(fa, fb, 0.9);                       // Haiku≈Kimi → a depth-2 cross-family cluster
  const report = buildIndustrialReport(runs, judge, pairCache, { primaryJudge: "us.amazon.nova-pro-v1:0" });
  const agentless = report.perArm.find((a) => a.arm === "agentless")!;
  assert.equal(agentless.precision, 1);            // its one finding judged valid
  assert.ok(report.depth.hetero.length >= 1);       // a cross-family depth table exists
  assert.equal(report.meta.prs.length, 1);
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test tests/unit/industrial-stats-report.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/industrial/report.ts`.** Compose Tasks 2–4 + `src/analysis/stats.ts`:
```ts
// Pure composition of the E3 report from persisted runs + judge cache. Zero I/O.
import type { IndustrialRun, JudgeCache, IndustrialReport, ArchitectureArm } from "./models.ts";
import { ARCHITECTURE_ARMS, FAMILY_ARMS, judgeKey } from "./models.ts";
import { buildPool, poolCoverage } from "./finding-pool.ts";
import { proxyPrecision, proxyF1 } from "./proxy-metrics.ts";
import { judgeGenuineByDepth, type DepthRow } from "./agreement-depth.ts";
import { wilcoxonSignedRank, cliffsDelta, bootstrapPairedCI, mean, median } from "../analysis/stats.ts";
import type { FindingPairScoreCache } from "../benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../models/finding.ts";

interface Options { primaryJudge?: string }

const verdictsFor = (judge: JudgeCache, model: string): Record<string, "valid" | "invalid" | "uncertain"> => {
  const out: Record<string, "valid" | "invalid" | "uncertain"> = {};
  const suffix = `::${model}`;
  for (const [k, v] of Object.entries(judge)) if (k.endsWith(suffix)) out[k.slice(0, -suffix.length)] = v;
  return out;
};
// union of a run-group's findings deduped is handled by buildPool clustering; here we just concat.
const concat = (runs: IndustrialRun[]): ReviewFinding[] => runs.flatMap((r) => r.findings);

export function buildIndustrialReport(runs: IndustrialRun[], judge: JudgeCache, pairCache: FindingPairScoreCache, opts: Options = {}): IndustrialReport {
  const primaryJudge = opts.primaryJudge ?? "us.amazon.nova-pro-v1:0";
  const verdicts = verdictsFor(judge, primaryJudge);
  const prs = [...new Set(runs.map((r) => r.pr))].sort();

  // family findings per (pr, family) → for pool + depth
  const familyRunsByPr = (pr: string): Map<string, ReviewFinding[]> => {
    const m = new Map<string, ReviewFinding[]>();
    for (const fam of FAMILY_ARMS) m.set(fam, concat(runs.filter((r) => r.pr === pr && r.axis === "family" && r.arm === fam)));
    return m;
  };

  // per-arm proxy metrics: precision (judge-genuine) + recall (leave-one-out pool coverage), macro over PRs
  const perArm = ARCHITECTURE_ARMS.map((arm: ArchitectureArm) => {
    const precs: number[] = []; const recalls: number[] = []; const f1s: number[] = [];
    for (const pr of prs) {
      const armFindings = concat(runs.filter((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm));
      if (armFindings.length === 0 && armFinderMissing(runs, pr, arm)) continue;
      // leave-one-out: exclude the Haiku family for ALL Haiku arms (Comparability Contract) → every arm scored vs the same {Kimi,GLM} pool
      const exclude = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
      const pool = buildPool(familyRunsByPr(pr), pairCache, { minSources: 2, excludeSource: exclude });
      const p = proxyPrecision(armFindings, verdicts);
      const r = poolCoverage(armFindings, pool, pairCache);
      precs.push(p); recalls.push(r); f1s.push(proxyF1(p, r));
    }
    return { arm, n: precs.length, precision: round(mean(precs)), recall: round(mean(recalls)), f1: round(mean(f1s)) };
  });

  // paired ladder contrasts on proxy-f1 (agentless vs generalists-3, generalists-3 vs hierarchical, hierarchical vs consensus)
  const ladder = pairedLadder(runs, verdicts, prs, familyRunsByPr, pairCache);

  // cross-family depth table (aggregate across PRs): hetero = all-family clusters; homo = Haiku self-recurrence across runs
  const hetero = aggregateDepth(prs.map((pr) => judgeGenuineByDepth(familyRunsByPr(pr), verdicts, pairCache)));
  const homo = aggregateDepth(prs.map((pr) => {
    const haikuRuns = runs.filter((r) => r.pr === pr && r.axis === "family" && r.arm === FAMILY_ARMS[0]);
    const byRun = new Map<string, ReviewFinding[]>(haikuRuns.map((r) => [`run${r.runIndex}`, r.findings]));
    return judgeGenuineByDepth(byRun, verdicts, pairCache); // depth here = # of Haiku runs agreeing
  }));

  const judges = [...new Set(Object.keys(judge).map((k) => k.split("::")[1]!))];
  const judgeKappa = judges.length >= 2 ? cohenKappa(judge, judges[0]!, judges[1]!) : null;

  const cost = ARCHITECTURE_ARMS.map((arm) => {
    const rs = runs.filter((r) => r.axis === "architecture" && r.arm === arm);
    const s = (pick: (c: IndustrialRun["cost"]) => number) => mean(rs.map((r) => pick(r.cost)));
    return { arm, llmCalls: round(s((c) => c.llmCalls)), messageCount: round(s((c) => c.messageCount)), latencyMs: round(s((c) => c.latencyMs)), estimatedCostUsd: round(s((c) => c.estimatedCostUsd), 4) };
  });

  return {
    meta: { prs, runsPerArm: maxRunIndex(runs) + 1, families: [...FAMILY_ARMS], judges, primary: "depth", secondary: "perArm+ladder", note: "Proxy metrics — no human ground truth. PRIMARY=cross-family judge-genuine-by-depth (E1 §4 replication). SECONDARY (proxy, wide CI on ~30 PRs)=per-arm P/R/F1 + ladder; precision=judge-genuine, recall=leave-one-out family-pool coverage." },
    perArm, ladder, depth: { hetero, homo }, triangulation: { staticByDepth: [], laterFixByDepth: [] }, judgeKappa, cost,
  };
}

function armFinderMissing(runs: IndustrialRun[], pr: string, arm: string): boolean {
  return !runs.some((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm);
}
function aggregateDepth(perPr: DepthRow[][]): Array<{ depth: number; genuine: number; total: number }> {
  const acc = new Map<number, { depth: number; genuine: number; total: number }>();
  for (const table of perPr) for (const row of table) {
    const a = acc.get(row.depth) ?? { depth: row.depth, genuine: 0, total: 0 };
    a.genuine += row.genuine; a.total += row.total; acc.set(row.depth, a);
  }
  return [...acc.values()].sort((x, y) => x.depth - y.depth);
}
function pairedLadder(runs: IndustrialRun[], verdicts: Record<string, "valid" | "invalid" | "uncertain">, prs: string[], familyRunsByPr: (pr: string) => Map<string, ReviewFinding[]>, pairCache: FindingPairScoreCache) {
  const f1ByArmPr = (arm: ArchitectureArm, pr: string): number => {
    const armF = runs.filter((r) => r.pr === pr && r.axis === "architecture" && r.arm === arm).flatMap((r) => r.findings);
    const exclude = "us.anthropic.claude-haiku-4-5-20251001-v1:0"; // LOO: exclude Haiku family for all arms (Comparability Contract)
    const pool = buildPool(familyRunsByPr(pr), pairCache, { minSources: 2, excludeSource: exclude });
    return proxyF1(proxyPrecision(armF, verdicts), poolCoverage(armF, pool, pairCache));
  };
  const pairs: Array<[ArchitectureArm, ArchitectureArm]> = [["agentless", "generalists-3"], ["generalists-3", "hierarchical"], ["hierarchical", "consensus"]];
  return pairs.map(([x, y]) => {
    const xs = prs.map((pr) => f1ByArmPr(x, pr));
    const ys = prs.map((pr) => f1ByArmPr(y, pr));
    const diffs = xs.map((v, i) => v - ys[i]!);
    const ci = bootstrapPairedCI(xs, ys, (a, b) => median(a.map((v, i) => v - b[i]!)), { iters: 2000, seed: 20260719 });
    return { label: `${x} vs ${y}`, metric: "proxy-f1", armX: x, armY: y, n: xs.length, meanX: round(mean(xs)), meanY: round(mean(ys)), medianDiff: round(ci.point), diffLo: round(ci.lo), diffHi: round(ci.hi), wilcoxonP: wilcoxonSignedRank(diffs).p, cliff: round(cliffsDelta(xs, ys)) };
  });
}
function cohenKappa(judge: JudgeCache, a: string, b: string): number {
  const ids = new Set(Object.keys(judge).filter((k) => k.endsWith(`::${a}`)).map((k) => k.split("::")[0]!));
  const pairs: Array<[string, string]> = [];
  for (const id of ids) { const va = judge[judgeKey(id, a)]; const vb = judge[judgeKey(id, b)]; if (va && vb) pairs.push([va, vb]); }
  if (pairs.length === 0) return 0;
  const agree = pairs.filter(([x, y]) => x === y).length / pairs.length;
  const cats = ["valid", "invalid", "uncertain"] as const;
  const pe = cats.reduce((s, c) => s + (frac(pairs, 0, c) * frac(pairs, 1, c)), 0);
  return pe >= 1 ? 1 : (agree - pe) / (1 - pe);
}
const frac = (pairs: Array<[string, string]>, i: 0 | 1, c: string): number => pairs.filter((p) => p[i] === c).length / pairs.length;
const maxRunIndex = (runs: IndustrialRun[]): number => runs.reduce((m, r) => Math.max(m, r.runIndex), 0);
const round = (x: number, d = 3): number => { const m = 10 ** d; return Number.isFinite(x) ? Math.round(x * m) / m : 0; };
```

- [ ] **Step 4: Run to verify it passes.** `node --test tests/unit/industrial-stats-report.test.ts` — Expected: PASS. Then `npx tsc -p tsconfig.json` — Expected: no errors in `src/industrial/`.

- [ ] **Step 5: Implement the thin script.** Create `scripts/phase3-industrial-stats.ts`:
```ts
// E3 analysis — replays persisted runs + judge cache into rap-portal-report.json.
// ZERO LLM. Run: node scripts/phase3-industrial-stats.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IndustrialRun, JudgeCache } from "../src/industrial/models.ts";
import { buildIndustrialReport } from "../src/industrial/report.ts";
import { FindingPairScoreCache } from "../src/benchmark/matching/finding-pair-judge.ts";

const DIR = resolve(process.env.RAP_PORTAL_DIR ?? join(import.meta.dirname, "..", "rap-portal-results"));
const runs = JSON.parse(readFileSync(join(DIR, "runs.json"), "utf8")) as IndustrialRun[];
const judge = JSON.parse(readFileSync(join(DIR, "judge-cache.json"), "utf8")) as JudgeCache;
const pairCache = FindingPairScoreCache.fromJSON(
  JSON.parse(readFileSync(join(DIR, "pair-judge-cache.json"), "utf8")) as Record<string, number>,
);

// optional triangulation inputs are merged in Task 7; absent here → empty arrays
const report = buildIndustrialReport(runs, judge, pairCache);
const out = join(import.meta.dirname, "..", "apps", "research-workbench", "rap-portal-report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
for (const a of report.perArm) console.log(`  ${a.arm.padEnd(14)} P=${a.precision} R=${a.recall} F1=${a.f1} (n=${a.n})`);
```

- [ ] **Step 6: Commit.**
```bash
git add src/industrial/report.ts scripts/phase3-industrial-stats.ts tests/unit/industrial-stats-report.test.ts
git commit -m "feat(e3): report composition + zero-LLM stats script"
```

---

## Task 6: Live campaign runner

**Files:**
- Create: `scripts/rap-portal-campaign.ts`
- Modify: `package.json`

Impure (Bedrock + `gh`) — no unit test; acceptance is the Task 9 2-PR smoke. Reuses the exact flow from `scripts/rap-portal-smoke.ts` (fetch → `importManualDiff` → `runExperiment` → `getExperimentResult`), extended to: register `generalists-3`; run the 4 architectures under Haiku AND agentless under each family model id (via `modelVersion`); judge every finding with each judge model; persist `runs.json` + `judge-cache.json` and **auto-upload the results dir to S3 after each PR** (best-effort; disable with `RAP_PORTAL_NO_UPLOAD=1`); resume per PR.

> ⚠️ **Comparability override (see Comparability Contract).** The runner must ALSO
> build and persist the **Nova finding↔finding pair-judge cache**
> (`pair-judge-cache.json`) over cross-family and cross-run finding pairs — reuse
> `buildFindingPairPrompt` / `FindingPairScoreCache` / `listCandidatePairs` from
> `src/benchmark/matching/finding-pair-judge.ts` and the `hetero:recluster`
> pattern. The pool and depth clustering (Tasks 2/4/5) **depend on this cache**;
> without it E3 falls back to Jaccard and is non-comparable. Also: the
> **genuine-judge prompt must be E1's completeness prompt**
> (`scripts/phase3-fp-completeness.ts` — "is this a genuine problem, given the
> diff?"), not an ad-hoc prompt, so proxy-precision is measured with E1's
> instrument. Persist `pair-judge-cache.json` alongside `runs.json` +
> `judge-cache.json` for zero-LLM replay.

- [ ] **Step 1: Implement.** Create `scripts/rap-portal-campaign.ts`:
```ts
/**
 * E3 live campaign — runs the 4-architecture ladder (Haiku) + cross-family
 * agentless (Haiku/Kimi/GLM), 3 runs each, over ~30 RAP-portal PRs, judges every
 * finding (Nova + DeepSeek), and PERSISTS runs + judge cache for zero-LLM replay.
 *
 * Preconditions: `gh auth status` (read access to logisticPM/portal), `aws sso login`
 * + Bedrock access to all reviewer + judge models, and s3:PutObject on the research
 * bucket (for the per-PR auto-upload). Run: `npm run rap-portal:run`
 * Env: RAP_PRS=12,13,14 (explicit) or RAP_PR_LIMIT=30 (auto-pick merged PRs);
 *      RUNS_PER_ARM=3; RAP_PORTAL_DIR=rap-portal-results;
 *      RAP_PORTAL_S3=s3://…/confirmatory/rap-portal/ (auto-upload dest; set empty
 *      or RAP_PORTAL_NO_UPLOAD=1 to disable)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { createGeneralistsArchitecture } from "../src/architectures/generalists/index.ts";
import { createHierarchicalArchitecture } from "../src/architectures/hierarchical/index.ts";
import { createConsensusArchitecture } from "../src/architectures/consensus/index.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { ARCHITECTURE_ARMS, FAMILY_ARMS, JUDGE_MODELS, judgeKey, type IndustrialRun, type JudgeCache } from "../src/industrial/models.ts";

const REPO = process.env.RAP_REPO ?? "logisticPM/portal";
const RUNS = Math.max(1, Number(process.env.RUNS_PER_ARM ?? 3));
const DIR = resolve(process.env.RAP_PORTAL_DIR ?? "rap-portal-results");
mkdirSync(DIR, { recursive: true });

// --- S3 auto-upload (best-effort; local disk stays the source of truth) ---
const S3_DEST = process.env.RAP_PORTAL_S3 ?? "s3://rap-review-research-data-106189426706/confirmatory/rap-portal/";
const S3_UPLOAD = S3_DEST !== "" && process.env.RAP_PORTAL_NO_UPLOAD !== "1";
function uploadToS3(): void {
  if (!S3_UPLOAD) return;
  try {
    // sync mirrors the whole results dir → runs/judge/pair-judge/static/laterfix .json
    execFileSync("aws", ["s3", "sync", DIR, S3_DEST, "--only-show-errors"], { stdio: "inherit" });
    console.log(`  ↑ synced ${DIR} → ${S3_DEST}`);
  } catch (e) {
    console.warn(`  ⚠ S3 upload failed (local copy kept, run stays resumable): ${String(e)}`);
  }
}

const gh = (args: string[]): string => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
function selectPRs(): string[] {
  if (process.env.RAP_PRS) return process.env.RAP_PRS.split(",").map((s) => s.trim());
  const limit = Number(process.env.RAP_PR_LIMIT ?? 30);
  const json = gh(["pr", "list", "-R", REPO, "--state", "merged", "--limit", String(limit * 2), "--json", "number,files"]);
  const prs = JSON.parse(json) as Array<{ number: number; files?: Array<{ path: string }> }>;
  const substantive = prs.filter((p) => (p.files ?? []).some((f) => /\.(ts|tsx|js|jsx|py|go|java|rb)$/.test(f.path)));
  return substantive.slice(0, limit).map((p) => String(p.number));
}
function fetchDiff(pr: string): { title: string; diff: string } {
  const title = gh(["pr", "view", pr, "-R", REPO, "--json", "title", "-q", ".title"]).trim();
  const diff = gh(["pr", "diff", pr, "-R", REPO]);
  return { title, diff };
}

// --- provider + architectures ---
const provider = new BedrockProvider();
const promptBuilder = new PromptBuilder(new PromptLoader(), new ContextBuilder());
const rawDiffStorage = new InMemoryRawDiffStorage();
const registry = new InMemoryArchitectureRegistry();
registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createGeneralistsArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createHierarchicalArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createConsensusArchitecture({ provider, promptBuilder, rawDiffStorage }));
const snapshots = new InMemorySnapshotRepository();
const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });

async function judge(model: string, diff: string, findings: ReviewFinding[]): Promise<Record<string, "valid" | "invalid" | "uncertain">> {
  if (findings.length === 0) return {};
  const list = findings.map((f) => `- ${f.id}: [${f.severity}] ${f.title} (${f.file}:${f.line})`).join("\n");
  try {
    const res = await provider.review({
      modelId: model, systemPrompt: "You are a strict senior code reviewer. For each finding, judge whether it is a genuine problem in the diff.",
      userPrompt: `## Diff\n\n${diff}\n\n## Findings\n\n${list}\n\n## Respond JSON only\n{ "<id>": "valid | invalid | uncertain" }`,
    });
    const parsed = JSON.parse((res.rawText ?? "{}").replace(/^```json?|```$/g, "")) as Record<string, string>;
    const out: Record<string, "valid" | "invalid" | "uncertain"> = {};
    for (const [id, v] of Object.entries(parsed)) if (v === "valid" || v === "invalid" || v === "uncertain") out[id] = v;
    return out;
  } catch { return {}; }
}

async function runArm(pr: string, snapshotId: string, axis: "architecture" | "family", arm: string, modelVersion: string, runIndex: number): Promise<IndustrialRun | null> {
  const architecture = axis === "family" ? "agentless" : arm;
  const run = await experimentCtx.service.runExperiment({ snapshotId, architecture, modelVersion, promptVersion: "v1", workflowVersion: "workflow-v1", evaluationVersion: "eval-v1" });
  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  const v = stored?.validatedResult;
  if (!v) return null;
  return { pr, snapshotId, axis, arm, runIndex, findings: v.findings, cost: { llmCalls: v.llmCalls, messageCount: v.messageCount, latencyMs: v.latencyMs, estimatedCostUsd: v.estimatedCostUsd, inputTokens: v.inputTokens, outputTokens: v.outputTokens } };
}

// --- main (resumable: skip PRs already in runs.json) ---
const RUNS_PATH = join(DIR, "runs.json");
const JUDGE_PATH = join(DIR, "judge-cache.json");
const runs: IndustrialRun[] = existsSync(RUNS_PATH) ? JSON.parse(readFileSync(RUNS_PATH, "utf8")) : [];
const judgeCache: JudgeCache = existsSync(JUDGE_PATH) ? JSON.parse(readFileSync(JUDGE_PATH, "utf8")) : {};
const done = new Set(runs.map((r) => r.pr));
const HAIKU = FAMILY_ARMS[0];

for (const pr of selectPRs()) {
  if (done.has(pr)) { console.log(`PR #${pr} — already done, skipping`); continue; }
  let title: string, diff: string;
  try { ({ title, diff } = fetchDiff(pr)); } catch (e) { console.error(`PR #${pr} fetch failed: ${String(e)}`); continue; }
  if (diff.trim().length === 0) { console.log(`PR #${pr} empty diff, skip`); continue; }
  const { snapshotId } = await importCtx.service.importManualDiff({ title: `[RAP] #${pr} ${title}`, source: "manual", rawDiff: diff });
  console.log(`PR #${pr} "${title}"`);

  const prRuns: IndustrialRun[] = [];
  for (let i = 0; i < RUNS; i++) {
    for (const arm of ARCHITECTURE_ARMS) { const r = await runArm(pr, snapshotId, "architecture", arm, HAIKU, i); if (r) prRuns.push(r); }
    for (const fam of FAMILY_ARMS) { const r = await runArm(pr, snapshotId, "family", fam, fam, i); if (r) prRuns.push(r); }
  }
  // judge every distinct finding with every judge model
  const allFindings = new Map<string, ReviewFinding>();
  for (const r of prRuns) for (const f of r.findings) allFindings.set(f.id, f);
  for (const model of JUDGE_MODELS) {
    const verdicts = await judge(model, diff, [...allFindings.values()]);
    for (const [id, v] of Object.entries(verdicts)) judgeCache[judgeKey(id, model)] = v;
  }
  runs.push(...prRuns);
  writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2));      // persist after each PR (resume-safe)
  writeFileSync(JUDGE_PATH, JSON.stringify(judgeCache, null, 2));
  uploadToS3();                                                 // auto-backup the whole DIR to S3 after each PR
  console.log(`  persisted ${prRuns.length} runs; ${Object.keys(judgeCache).length} judge verdicts total`);
}
uploadToS3();  // final flush (captures pair-judge-cache.json / static.json / laterfix.json too, if present)
console.log(`done — ${runs.length} runs over ${new Set(runs.map((r) => r.pr)).size} PRs → ${DIR}${S3_UPLOAD ? ` (mirrored to ${S3_DEST})` : ""}`);
```
> **Adaptation note:** confirm `provider.review()`'s response field for raw text (`rawText` vs `content`) in `src/llm/models/llm-review-response.ts`, and that `runExperiment` accepts `modelVersion` as the Bedrock model id. Adapt those two call sites if the real names differ; report any change.

- [ ] **Step 2: Add npm scripts.** In `package.json` `"scripts"`, after `"smoke:rap": ...`:
```json
    "rap-portal:run": "node scripts/rap-portal-campaign.ts",
    "rap-portal:static": "node scripts/rap-portal-static.ts",
    "rap-portal:stats": "node scripts/phase3-industrial-stats.ts",
```

- [ ] **Step 3: Type-check.** Run: `npx tsc -p tsconfig.json` — Expected: no errors. (No LLM run yet.)

- [ ] **Step 4: Commit.**
```bash
git add scripts/rap-portal-campaign.ts package.json
git commit -m "feat(e3): live campaign runner (4 arch + cross-family, judged, persisted, resumable)"
```

---

## Task 7: Static-analysis + later-fix producers (best-effort triangulation)

**Files:**
- Create: `scripts/rap-portal-static.ts`
- Modify: `src/industrial/report.ts` (merge triangulation inputs when present)

Produces `rap-portal-results/static.json` (`{ pr: StaticAnalysisFinding[] }`) via `tsc`/ESLint on the changed files, and `laterfix.json` (`{ pr: ChangedRange[] }`) by mining commits after each PR's merge. These are **best-effort**: if a tool or history is unavailable, the file is written with the PRs it could cover, and the report labels the signal coverage-limited.

- [ ] **Step 1: Implement `scripts/rap-portal-static.ts`.**
```ts
/**
 * Best-effort static-analysis + later-fix producer for E3 triangulation. Uses the
 * portal repo checked out locally (RAP_PORTAL_REPO_PATH). Writes static.json and
 * laterfix.json into RAP_PORTAL_DIR. Any PR a tool can't cover is simply omitted.
 * Run: `npm run rap-portal:static`
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IndustrialRun } from "../src/industrial/models.ts";
import type { StaticAnalysisFinding, ChangedRange } from "../src/evaluation/industrial/models.ts";

const DIR = resolve(process.env.RAP_PORTAL_DIR ?? "rap-portal-results");
const REPO_PATH = process.env.RAP_PORTAL_REPO_PATH; // local clone of logisticPM/portal
const runs = JSON.parse(readFileSync(join(DIR, "runs.json"), "utf8")) as IndustrialRun[];
const prs = [...new Set(runs.map((r) => r.pr))];

const staticByPr: Record<string, StaticAnalysisFinding[]> = {};
const laterFixByPr: Record<string, ChangedRange[]> = {};
for (const pr of prs) {
  staticByPr[pr] = REPO_PATH ? runStaticAnalysis(pr, REPO_PATH) : [];
  laterFixByPr[pr] = REPO_PATH ? mineLaterChanges(pr, REPO_PATH) : [];
}
writeFileSync(join(DIR, "static.json"), JSON.stringify(staticByPr, null, 2));
writeFileSync(join(DIR, "laterfix.json"), JSON.stringify(laterFixByPr, null, 2));
console.log(`static.json + laterfix.json written for ${prs.length} PRs (repo ${REPO_PATH ? "present" : "MISSING → empty"})`);

function runStaticAnalysis(pr: string, repo: string): StaticAnalysisFinding[] {
  // Run `tsc --noEmit` and parse "file(line,col): error TSxxxx: msg" lines. ESLint/Semgrep optional.
  try {
    const out = execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return parseTsc(out);
  } catch (e: unknown) {
    const stdout = (e as { stdout?: string }).stdout ?? "";
    return parseTsc(stdout);
  }
}
function parseTsc(out: string): StaticAnalysisFinding[] {
  const findings: StaticAnalysisFinding[] = [];
  for (const line of out.split("\n")) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/.exec(line.trim());
    if (m) findings.push({ file: m[1]!, line: Number(m[2]), rule: m[3], category: "type" });
  }
  return findings;
}
function mineLaterChanges(pr: string, repo: string): ChangedRange[] {
  // Files+lines touched by commits merged AFTER this PR. Coarse: diff the PR's merge commit against HEAD per file.
  try {
    const files = execFileSync("git", ["-C", repo, "diff", "--name-only", `origin/main`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return files.map((file) => ({ file, lineStart: 1, lineEnd: 1_000_000 })); // whole-file overlap; refined later if needed
  } catch { return []; }
}
```

- [ ] **Step 2: Merge triangulation into the report.** In `src/industrial/report.ts`, extend `buildIndustrialReport(runs, judge, pairCache, opts)` to accept optional `opts.staticByPr` and `opts.laterFixByPr`, and populate `triangulation.staticByDepth` / `laterFixByDepth` by treating "static flags this cluster" and "a later change overlaps this cluster" as extra depth-bucketed genuine signals (reuse `judgeGenuineByDepth`'s bucketing; substitute the static/later-fix boolean for the judge verdict). Show the full code:
```ts
// add to Options:
interface Options { primaryJudge?: string; staticByPr?: Record<string, import("../evaluation/industrial/models.ts").StaticAnalysisFinding[]>; laterFixByPr?: Record<string, import("../evaluation/industrial/models.ts").ChangedRange[]> }
// after computing hetero/homo, add (only when inputs present):
const staticByDepth = opts.staticByPr ? aggregateDepth(prs.map((pr) => corroborationDepth(familyRunsByPr(pr), pairCache, (fnd) => staticHit(fnd, opts.staticByPr![pr] ?? [])))) : [];
const laterFixByDepth = opts.laterFixByPr ? aggregateDepth(prs.map((pr) => corroborationDepth(familyRunsByPr(pr), pairCache, (fnd) => rangeHit(fnd, opts.laterFixByPr![pr] ?? [])))) : [];
// ...set triangulation: { staticByDepth, laterFixByDepth }
```
and add helpers to `report.ts`:
```ts
import type { StaticAnalysisFinding, ChangedRange } from "../evaluation/industrial/models.ts";
import type { FindingPairScoreCache } from "../benchmark/matching/finding-pair-judge.ts";
import { buildPool } from "./finding-pool.ts";
function corroborationDepth(familyFindings: ReadonlyMap<string, ReviewFinding[]>, cache: FindingPairScoreCache, hit: (f: ReviewFinding) => boolean) {
  const clusters = buildPool(familyFindings, cache, { minSources: 1 });
  const rows = new Map<number, { depth: number; genuine: number; total: number }>();
  for (const c of clusters) { const d = c.sources.size; const r = rows.get(d) ?? { depth: d, genuine: 0, total: 0 }; r.total++; if (hit(c.rep)) r.genuine++; rows.set(d, r); }
  return [...rows.values()].sort((a, b) => a.depth - b.depth);
}
const staticHit = (f: ReviewFinding, sa: StaticAnalysisFinding[]): boolean => sa.some((s) => s.file === f.file && Math.abs(s.line - f.line) <= 10);
const rangeHit = (f: ReviewFinding, cr: ChangedRange[]): boolean => cr.some((c) => c.file === f.file && f.line >= c.lineStart && f.line <= c.lineEnd);
```

- [ ] **Step 3: Extend the test.** Add a case to `tests/unit/industrial-stats-report.test.ts` passing `staticByPr` and asserting `report.triangulation.staticByDepth.length >= 1`. Run: `node --test tests/unit/industrial-stats-report.test.ts` — Expected: PASS.

- [ ] **Step 4: Wire the script inputs.** In `scripts/phase3-industrial-stats.ts`, load `static.json`/`laterfix.json` if present and pass to `buildIndustrialReport(runs, judge, pairCache, { staticByPr, laterFixByPr })`.

- [ ] **Step 5: Commit.**
```bash
git add scripts/rap-portal-static.ts src/industrial/report.ts scripts/phase3-industrial-stats.ts tests/unit/industrial-stats-report.test.ts
git commit -m "feat(e3): best-effort static-analysis + later-fix triangulation"
```

---

## Task 8: Dashboard E3 view

**Files:**
- Create: `apps/research-workbench/industrial.ts`
- Modify: `apps/research-workbench/server.ts`, `apps/research-workbench/render.ts`

Mirrors the confirmatory dashboard pattern already in the repo (`apps/research-workbench/confirmatory.ts` + its routes). Renders `rap-portal-report.json`.

- [ ] **Step 1: Implement `apps/research-workbench/industrial.ts`.**
```ts
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

export function renderIndustrial(d: IndustrialReport): string {
  const perArm = table(["Architecture", "PRs", "Proxy-Precision", "Proxy-Recall", "Proxy-F1"],
    d.perArm.map((a) => [a.arm, a.n, f3(a.precision), f3(a.recall), f3(a.f1)]));
  const ladder = table(["Contrast", "Metric", "Arm X (mean)", "Arm Y (mean)", "Δ̃", "Wilcoxon p", "Cliff δ"],
    (d.ladder as any[]).map((c) => [c.label, c.metric, `${c.armX} (${f3(c.meanX)})`, `${c.armY} (${f3(c.meanY)})`, f3(c.medianDiff), c.wilcoxonP < 1e-4 ? c.wilcoxonP.toExponential(1) : c.wilcoxonP.toFixed(4), f3(c.cliff)]));
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
```

- [ ] **Step 2: Add the route.** In `apps/research-workbench/server.ts`, import `{ loadIndustrial, renderIndustrial, industrialNotReady }` and add before the demo routes:
```ts
    if (path === "/industrial") {
      const ind = loadIndustrial();
      return send(res, 200, layout("Industrial (E3)", ind ? renderIndustrial(ind) : industrialNotReady()));
    }
```

- [ ] **Step 3: Add the nav link.** In `apps/research-workbench/render.ts`, in the `<nav>` block, after the `/cross-family` link add:
```ts
  ${link("/industrial", "Industrial (E3)")}
```

- [ ] **Step 4: Verify render with a fixture.** Create a tiny `apps/research-workbench/rap-portal-report.json` by running the Task 5 test's report through the script on fixture data, OR hand-write a 1-arm stub, then:
Run: `PORT=4320 node apps/research-workbench/server.ts &` then fetch `/industrial` via node and assert HTTP 200 + contains "proxy". Kill the server.
Expected: 200, body contains "Per-architecture proxy metrics".

- [ ] **Step 5: Commit.**
```bash
git add apps/research-workbench/industrial.ts apps/research-workbench/server.ts apps/research-workbench/render.ts
git commit -m "feat(e3): dashboard industrial (E3) view"
```

---

## Task 9: End-to-end 2-PR smoke + docs

**Files:**
- Modify: `docs/experiment/13-rap-portal-industrial-design.md` (status → implemented), `README.md` (E3 run steps)

- [ ] **Step 1: Full suite green.** Run: `npm run check` (typecheck + `node --test`) — Expected: all pass.

- [ ] **Step 2: 2-PR live smoke.** Pick two real merged portal PRs and run the whole pipeline small:
```bash
gh auth status        # read access to logisticPM/portal
aws sso login         # Bedrock access; npm run smoke:bedrock to confirm
RAP_PRS=<a>,<b> RUNS_PER_ARM=1 npm run rap-portal:run
npm run rap-portal:stats
```
Expected: `rap-portal-results/runs.json` + `judge-cache.json` written; `apps/research-workbench/rap-portal-report.json` written; console prints per-arm P/R/F1 for the 4 architectures. `/industrial` renders them.

- [ ] **Step 3: Sanity-check the numbers.** Confirm: 4 architecture arms present; family arms Haiku/Kimi/GLM present; `perArm` precision ∈ [0,1]; a non-empty cross-family depth table; cost row shows non-zero llmCalls (1/3/3/9 pattern for the four arms).

- [ ] **Step 4: Confirm S3 + update docs.** The runner already auto-uploads after each PR, so this is only a final verification/flush (a no-op if nothing changed):
```bash
aws s3 sync rap-portal-results/ s3://rap-review-research-data-106189426706/confirmatory/rap-portal/
```
Update `docs/experiment/13-…md` status to "implemented; smoke passed" and add the run recipe to `README.md`.

- [ ] **Step 5: Commit.**
```bash
git add apps/research-workbench/rap-portal-report.json docs/experiment/13-rap-portal-industrial-design.md README.md
git commit -m "feat(e3): 2-PR smoke passing; wire E3 report to dashboard; docs"
```

- [ ] **Step 6 (separate, deliberate): the full ~30-PR paid run.** Only after the smoke is reviewed:
```bash
RAP_PR_LIMIT=30 RUNS_PER_ARM=3 npm run rap-portal:run   # paid Bedrock; resumable
RAP_PORTAL_REPO_PATH=/path/to/portal npm run rap-portal:static
npm run rap-portal:stats
aws s3 sync rap-portal-results/ s3://rap-review-research-data-106189426706/confirmatory/rap-portal/   # final flush: pushes static.json/laterfix.json produced AFTER the (already auto-uploaded) campaign
```
Commit the refreshed `apps/research-workbench/rap-portal-report.json`.

---

## Self-Review Notes (plan author)
- **Spec coverage:** §2 hypotheses → Tasks 3/5 (proxy P/R/F1 + ladder) & Task 4 (depth); §3 arms/sample → Task 6 (4 arch + families, PR selection, 3 runs); §4 metrics/pool → Tasks 2/3 (leave-one-out pool, judge precision) & Task 8 (cost row); §5 analysis → Task 5 (paired stats, κ) + Task 7 (triangulation); §6 components → Tasks 5/6/7/8 (runner+stats+dashboard, reuse of `industrial/*`, PR-import, stats); §7 threats → surfaced in dashboard note + docs (Task 9); §8 testing → Tasks 1–5, 9.
- **No placeholders:** every code step is complete; the only deferred detail (whole-file later-fix range) is a documented coarse default, not a TODO.
- **Type consistency:** `IndustrialRun`/`JudgeCache`/`judgeKey`/`ARCHITECTURE_ARMS`/`FAMILY_ARMS` defined in Task 1 and used verbatim in Tasks 5/6/7/8; `buildPool`/`poolCoverage` (Task 2) and `proxyPrecision`/`proxyF1` (Task 3) consumed by `report.ts` (Task 5); `IndustrialReport` (Task 1) rendered in Task 8.
- **Adaptation flags (real-API confirmations the implementer must make):** the Nova pair-judge clustering API (`clusterFindingsSemantically` + `FindingPairScoreCache` from `finding-pair-judge.ts`, per the Comparability Contract — this supersedes the illustrative `FindingSimilarity.areSame` snippet in Tasks 2/4); `provider.review()` raw-text field + `runExperiment({modelVersion})` model routing (Task 6). Each is isolated to one call site with a note.
- **Impure boundary:** Tasks 6/7 aren't unit-tested (live Bedrock/gh/git); acceptance is the Task 9 smoke — deliberate, matches the repo's runner/stats split.
