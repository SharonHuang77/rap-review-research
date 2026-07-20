# 14 — RAP Portal Industrial Study (E3) — Results

**Status:** E3 confirmatory campaign complete. **30 real merged PRs** from
`github.com/logisticPM/portal`, the 4-architecture ladder + cross-family
agentless axis, 3 runs each = **627 runs**. All numbers below **replay
deterministically from persisted artifacts with zero LLM calls** — every review,
judge verdict, and pair score is cached and mirrored to S3.

**Comparability:** E3 uses the *same instruments as E1* (freeze v1+v2): SUT
Claude Haiku 4.5, frozen v1 prompt, 3 runs, Nova Pro finding↔finding pair judge
at τ_pair=0.7, `src/analysis/stats.ts`. The only intended differences are the
dataset (real, unlabeled) and two labelled proxies (judge-genuine precision,
leave-one-out pool-coverage recall). See `13-rap-portal-industrial-design.md`.

**Provenance:**

| Result | Script / module | Artifact |
|---|---|---|
| Runs + judge + pair caches | `scripts/rap-portal-campaign.ts` | `s3://…/confirmatory/rap-portal/{runs,judge-cache,pair-judge-cache}.json` |
| Report (depth, proxy P/R/F1, κ, cost) | `scripts/phase3-industrial-stats.ts` → `src/industrial/report.ts` | `apps/research-workbench/rap-portal-report.json` |

---

## 1. Campaign scope

- **Sample:** 30 substantive merged PRs (#127–#180 range, code-file diffs).
- **Architecture axis:** `agentless, generalists-3, hierarchical, consensus`
  under Haiku 4.5, 3 runs each.
- **Cross-family axis:** `agentless` under **Haiku 4.5 / Kimi K2.5 / GLM 5**,
  3 runs each.
- **Judges (non-circular):** Nova Pro (primary) + DeepSeek V3.2 (second),
  disjoint families from all reviewers.
- **Spend proxy:** ~24.9M input / 3.06M output tokens. (`estimatedCostUsd` is not
  wired for the marketplace models, so the report's cost column reads $0; tokens
  and calls/latency below are the real cost signal.)

## 2. Cross-family corroboration-depth (PRIMARY) — does NOT replicate

The registered E3 primary analysis mirrors E1 §4: cluster the family-agentless
findings with the Nova pair judge, bucket by how many families agree (depth), and
report the judge-genuine rate per depth. **The result is entirely judge-dependent
and does not reproduce E1's monotonic gradient.**

| Sources agreeing | depth 1 | depth 2 | depth 3 |
|---|:---:|:---:|:---:|
| **E1 / Qodo (reference)** — cross-family | 28% | 51% | **89%** |
| **E3 — genuine judge = Nova Pro** | 876/876 (**100%**) | 23/23 (**100%**) | 5/5 (**100%**) |
| **E3 — genuine judge = DeepSeek V3.2** | 135/876 (**15%**) | 0/23 (**0%**) | 0/5 (**0%**) |

Same-model baseline (Haiku ×3 runs) collapses to a single bucket at τ=0
determinism — depth-3 170/170, with no depth-1/2 spread (unlike E1's 14/17/54%).

Two things break the replication:

1. **Cross-family agreement is rare on real code.** Only **23** findings reach
   depth-2 and **5** reach depth-3 out of 904 clusters (E1 had 114 / 137). Real,
   diffuse review findings do not converge the way injected defects do.
2. **The genuine-judge is unreliable, and the depth signal inverts with it.**
   With the discriminating judge (DeepSeek), agreement depth **anti-correlates**
   with genuineness: solo findings are 15% genuine, but findings 2–3 families
   agreed on are **0%**. On real code, what independent models converge on tends
   to be generic surface nitpicks ("consider a comment", "possible edge case")
   that a strict judge rejects — the opposite of an injected Qodo defect.

## 3. Judge (un)reliability

The genuine-judges disagree almost completely, so "is this finding genuine?" is
not resolvable by LLM judge on this dataset:

| Genuine judge | valid | invalid | % valid |
|---|:---:|:---:|:---:|
| Nova Pro | 126 | 1 | **99%** (rubber stamp) |
| DeepSeek V3.2 | 86 | 41 | **68%** |

**Cohen's κ (Nova vs DeepSeek) = 0.03** — barely above chance. (For contrast,
E1's *pair* judge — same-issue matching, an objective question — reproduced at
κ=0.95. The subjective "is it a real bug?" question does not.)

## 4. Proxy metrics ladder (SECONDARY) — directionally corroborates E1

Pool-coverage recall is **judge-independent** (built from the pair judge, not the
genuine judge); precision depends on which genuine judge is used.

| Arm | Recall (pool) | Precision (Nova) | Precision (DeepSeek) |
|---|:---:|:---:|:---:|
| **Agentless** | **0.267** (highest) | 0.867 | 0.099 |
| Generalists-3 | 0.200 | 0.833 | 0.231 |
| Hierarchical | 0.200 | 1.000 | 0.313 |
| Consensus | **0.100** (lowest) | 0.884 | 0.884 |

- **Recall ladder corroborates E1's core finding:** agentless has the highest
  pool coverage and consensus the lowest — more/structured agents do **not** buy
  coverage on real code either.
- **Precision is not interpretable** — it swings entirely with judge choice
  (see §3), so no arm-precision claim is made.

## 5. Cost / communication — transfers cleanly (mirrors E1)

| Arm | LLM calls | Messages | Latency |
|---|:---:|:---:|:---:|
| Agentless | 1 | 1 | 13.2 s |
| Generalists-3 | 3 | 3 | 38.1 s |
| Hierarchical | 3 | 8 | 45.7 s |
| Consensus | 9 | 22 | **173.2 s** (≈13× agentless) |

The communication-overhead ladder is identical in shape to E1/E2 — the one result
that transfers to real code without caveat.

## 6. Headline

> On real, unlabeled industrial PRs, the **cross-family precision instrument does
> not replicate** — not because families never agree, but because "is this
> finding genuine?" is not resolvable by an LLM judge here (Nova 99% rubber-stamp,
> DeepSeek inverts the gradient, κ=0.03). The **cost/communication ladder** and
> the **recall ladder** (agentless ≥ multi-agent) transfer cleanly. E3 is thus a
> **boundary condition** on E1's confirmed finding: the benchmark result's
> precondition — a trustworthy correctness signal — fails on real code, exactly
> as E1 anticipated ("is this a real bug is not settled by any LLM judge;
> magnitude awaits human adjudication").

## 7. Threats / limitations

- **No ground truth → proxies only.** Every E3 correctness number is a proxy and
  is reported as such; no precision/recall/F1 is claimed as absolute.
- **Judge dominance.** The depth→precision result is dominated by judge choice,
  not corroboration — the central limitation, surfaced by the two-judge design.
- **Sparsity + power.** 23/5 clusters at depth 2/3 are thin; CIs are wide.
- **Same-model determinism.** Haiku at τ=0 collapses the homo baseline to
  depth-3, removing the low-depth contrast E1 had.
- **Portal is partly AI-authored** (built with Claude Code) — disclosed;
  generalization to human-authored code is a limitation E1/E2 partly offset.

## 8. Pending

- **Human adjudication** of a fixed sample (≈50 findings across depths) — the only
  thing that can actually settle whether depth tracks correctness on real code,
  since the LLM judges cannot.
- **Static-analysis + later-fix triangulation** not run (`rap-portal:static`
  needs a local portal clone); the triangulation buckets are empty.
- **Cost in USD** — wire pricing for the marketplace models to replace the token
  proxy.
