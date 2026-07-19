# 13 — RAP-Portal Industrial Study (E3) — design spec

**Date:** 2026-07-19 · **Type:** Experiment design (industrial, no ground truth) · **Status:** Design — pending implementation plan

> The industrial third leg (E3) of the benchmark strategy, deferred at the confirmatory
> freeze (see `12-confirmatory-results.md`). E3 evaluates the **same four-architecture
> ladder** as Qodo (E1) and SWE-PRBench (E2) on **real, unlabeled pull requests from the
> deployed RAP Portal** (`github.com/logisticPM/portal`). Because the portal has no
> authoritative human ground truth, correctness is replaced by **corroboration**: a
> pooled pseudo-ground-truth (for recall) and an independent-family LLM judge (for
> precision), triangulated with static analysis and later-fix mining.

---

## 1. Goal & role in the paper

E1 (Qodo) measures correctness against injected ground truth; E2 (SWE-PRBench) measures
coverage of human review comments; **E3 (RAP Portal) measures corroboration on a live,
unlabeled codebase.** E3 exists to (a) place the paper's spine — the one-variable-per-rung
architecture ladder (`agentless → generalists-3 → hierarchical → consensus`) — on real
production code so the four-way comparison is a genuine third dataset column, and (b)
externally replicate the one **confirmed** benchmark finding: *cross-family agreement is a
precision instrument*.

E3 makes **no correctness claim** and never reports precision/recall/F1 as absolute
numbers. Every E3 metric is a **proxy**, labelled as such.

## 2. Hypotheses tested (re-tested on real code)

The four-rung ladder yields the same registered contrasts as E1/E2, measured with proxies:

- **H1 (compute):** generalists-3 ≥ agentless — proxy-recall (pool coverage).
- **H2 (specialization, PRIMARY):** hierarchical vs generalists-3 — proxy-recall at comparable proxy-precision.
- **H3 (communication):** consensus vs hierarchical — proxy-precision.
- **H-hetero-precision (external validity, SECONDARY):** on real PRs, findings corroborated by
  ≥2 model families are judged genuine at a higher rate than single-family findings
  (the direct analog of E1 §4's confirmed result, with judge-genuine replacing golden-matched).

Each contrast is directional and reported regardless of outcome (a null replicates E1's null;
a positive replicates E1's positive). E3 is confirmatory only for H-hetero external validity;
for H1/H2/H3 it is a **corroborating replication** (proxy metrics), not a substitute for E1.

## 3. Arms & data

- **Sample:** ~30 substantive **merged** PRs from `logisticPM/portal`, imported as immutable
  snapshots via the existing PR-import service. "Substantive" = non-trivial diff (≥1 changed
  code file, excludes pure-docs/config/lockfile PRs). Selection rule is pre-specified and the
  final PR list is frozen and reported.
- **Cross-architecture axis (main ladder):** `agentless`, `generalists-3`, `hierarchical`,
  `consensus` under the SUT family **Claude Haiku 4.5**, **3 runs each** (temperature per the
  frozen manifest; generalists-3 at its frozen sampleTemperature).
- **Cross-family axis (external validity):** `agentless` review by **Haiku 4.5 (SUT) + Kimi
  K2.5 + GLM-5**, **3 runs each**. The 3 frozen-SUT runs give the self-recurrence baseline
  (E1 §4's 54%-analog); the other families give cross-family agreement depth.
- **Judge:** independent-family finding→diff "genuine problem?" verdict — **Nova Pro
  (primary) + DeepSeek V3.2 (second judge)**; report judge-invariance κ. Judges are distinct
  families from all reviewers (Haiku/Kimi/GLM) → no self-judging circularity.
- **Static analysis:** ESLint + `tsc --noEmit` + Semgrep over each PR's changed files
  (portal is TS/Next.js) — a deterministic, non-LLM corroboration reference.
- **Later-fix mining:** for each PR, mine commits merged *after* it; a finding's line-range
  being subsequently modified is a temporal fix proxy. Reported as coverage-limited secondary.

## 4. Metrics (proxy) — parallels to E1/E2

| E1/E2 metric | E3 proxy | Definition |
|---|---|---|
| Precision | **judge-genuine rate** | fraction of an arm's findings the independent judge rates genuine, given the diff |
| Recall | **pool coverage** | fraction of the pooled pseudo-ground-truth an arm recovers, **leave-one-out** |
| F1 | proxy-F1 | harmonic mean of the two |
| Human agreement (E2) | — | E3's pool-coverage is the industrial analog of E2's human-comment coverage |
| Evidence Score | per-arch **Evidence Score** | existing `src/evaluation/evidence-metrics.ts` weighted signal |
| Finding count, LLM calls, message count | as-is | fills the RAP-Portal column of the §12 metrics table |

### Pooled pseudo-ground-truth (the recall reference)
- **Pool(PR)** = set of distinct findings (deduped by semantic finding-similarity) that are
  **corroborated by ≥2 independent sources**. A "source" is counted at the level that makes the
  corroboration *independent*: the three **model families** (Haiku/Kimi/GLM) and **static
  analysis** are the independent sources for the pool; the four architectures are *not* counted
  as separate sources among themselves (they share the Haiku model, so same-model/different-
  topology agreement is not independent corroboration). Agreement = inclusion (standard IR
  pooling). Cross-family agreement is the strong signal; static analysis adds a non-LLM source.
- **Leave-one-out:** when scoring architecture *A*'s recall, rebuild the pool **excluding A's
  own contribution**, so an arm cannot inflate its recall by defining the reference. The judge
  is **not** used to build the recall pool (kept independent of the precision instrument).
- **Sensitivity check:** recompute with a stricter pool (**judge-genuine AND ≥2 sources**) from
  cache; report that the arm ranking is threshold-robust.

## 5. Analysis

- **Per-arm proxy-P / proxy-R / proxy-F1** for the four architectures, macro-averaged over PRs,
  with paired Wilcoxon + bootstrap CIs + Cliff's δ (reuse `src/analysis/stats.ts`, same as
  `phase3-stats.ts`). Holm–Bonferroni within the H1/H2/H3 family.
- **Cross-family judge-genuine rate by agreement depth (1/2/3)** — the external-validity table,
  mirroring E1 §4's depth table; paired stats as in `phase3-hetero-stats.ts`.
- **Triangulation:** static-analysis agreement rate and later-fix rate by depth — do they trend
  with the judge signal? Reported as convergent (or divergent) corroboration, not as primary.
- **Judge invariance:** κ between Nova Pro and DeepSeek verdicts.

## 6. Components & data flow (reuse-heavy; follows the E1/E2 runner→stats split)

```
gh PR list → PR-import (immutable snapshots)
           → run arms (4 architectures ×Haiku + agentless ×{Kimi,GLM}) ×3 runs   [Bedrock, paid]
           → judge each finding (Nova, DeepSeek)                                  [Bedrock, paid]
           → static analysis (ESLint/tsc/Semgrep)   + later-fix mining (git)      [local]
           → persist runs.json + judge-cache.json + static.json + laterfix.json   [disk → S3]
phase3-industrial-stats.ts  (zero-LLM replay from cache)
           → rap-portal-report.json  → dashboard E3 view
```

- **`scripts/rap-portal-campaign.ts`** *(new)* — the runner. Fetches PRs (like the existing
  `rap-portal-smoke.ts`), imports snapshots, runs all arms, calls the judges, runs static
  analysis + later-fix mining, and **persists** runs + a judge cache (so re-analysis is
  zero-LLM). Resumable per PR (reuse the campaign manifest pattern).
- **`scripts/phase3-industrial-stats.ts`** *(new)* — the analysis. Builds the leave-one-out
  pool, computes proxy-P/R/F1 + depth table + triangulation + κ, writes `rap-portal-report.json`.
  Mirrors `scripts/phase3-hetero-stats.ts`.
- **Reused as-is:** `src/evaluation/industrial/*` (architecture-agreement, static-analysis-
  agreement, llm-judge-validation, later-fix-rate, finding-similarity, industrial-verification),
  `src/evaluation/evidence-metrics.ts`, the PR-import service, the architecture registry, the
  cached-judge / semantic-cache pattern, `src/analysis/stats.ts`.
- **Dashboard:** a `/industrial` view rendering `rap-portal-report.json`, extending the
  confirmatory dashboard (`apps/research-workbench/`).
- **Persistence:** artifacts uploaded to the existing research bucket under
  `s3://rap-review-research-data-<acct>/confirmatory/rap-portal/`; the derived report is
  committed (small) so the dashboard runs without S3, matching the E1/E2 pattern.

## 7. Threats to validity (must appear in the paper)

- **No ground truth → corroboration, not correctness.** All E3 metrics are proxies; never
  reported as precision/recall/F1 without the "proxy/judge-genuine/pool-coverage" qualifier.
- **Proxy-recall is relative to the ensemble, not absolute** — identical caveat to E2's
  human-comment coverage. A defect no source found is invisible to the pool.
- **Judge bias** — the judge may share blind spots with reviewer models; mitigated by using
  judge families disjoint from reviewers, a second judge with reported κ, and static/later-fix
  triangulation.
- **Shared-blind-spot in the pool** — corroboration cannot catch an error all sources make.
- **Portal code is partly AI-authored** (built with Claude Code) — disclosed; findings concern
  code quality regardless of authorship, but generalization to human-authored code is a
  limitation E1/E2 partly offset.
- **Small n (~30) + sparse later-fix** — honest CIs; later-fix labelled coverage-limited.

## 8. Testing

- Unit tests (deterministic, zero-LLM) on fixture runs: pool construction, **leave-one-out**
  correctness, depth-bucketing, proxy-P/R/F1, evidence aggregation.
- Cache-replay test: `phase3-industrial-stats.ts` produces byte-identical output on a second
  run (no LLM).
- A **2-PR smoke** (`RAP_PRS=…`) end-to-end before the ~30-PR paid run.
- `npm run typecheck` + existing `node --test` suite stay green.

## 9. Cost & scope

- Rough call budget per PR: 4 architectures ×Haiku (agentless 1 + generalists-3 3 +
  hierarchical 3 + consensus 9 = 16) + cross-family agentless (Kimi 1 + GLM 1) = ~18 review
  calls × 3 runs ≈ 54 review calls/PR, plus ~1 judge call per finding × 2 judges. Over ~30 PRs
  this is a bounded but real Bedrock spend; the 2-PR smoke calibrates it first.
- Out of scope: the `agentless-large` 5th arm and the Sonnet-4.5 robustness arm (separate
  registered items); human adjudication of judge verdicts (future work).

## 10. Success criteria

- E3 reports proxy-P / proxy-R / proxy-F1 for all four architectures on ~30 real PRs, with the
  same paired-statistics as E1, giving the paper a genuine third dataset column and re-testing
  H1/H2/H3 on real code.
- E3 reports the cross-family judge-genuine-by-depth table, externally replicating (or refuting)
  E1 §4's confirmed cross-family precision finding.
- All artifacts persist and the report replays from cache with zero LLM calls; the dashboard
  shows the E3 results alongside E1/E2.
