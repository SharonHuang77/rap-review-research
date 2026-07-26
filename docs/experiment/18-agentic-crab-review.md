# doc-18 — Agentic reviewer on c-CRAB (experiment ②): does agency move the ceiling?

Status: **FULL RUN (N=158) complete** (pilot N=20 first, then scaled). Exploratory, not
registered. Read-only navigation (no execution — that is experiment ③). Verdict, robust across
both scales: agency is a **precision/verification** mechanism, **not** the recall lever
hypothesised — it does not clear the diff-only recall bar.

## 0. The question

doc-17 closed the "decorrelation + its bounds" story: a ~83% diff-scoped reachable-set
ceiling (§8), whose unreachable residue is ~65% a linter's job and ~15% a **functional
hard-core** — cross-file renames, dynamic imports, races, harmful deletions (§10). doc-16
(Phase B) showed that handing the reviewer PASSIVE whole-file + 1-hop-dependency context
does **not** move recall (structural ≈ diff-only, null): more context on the page is not
the lever. The open question the whole program points to: is **agency** — letting the
reviewer actively navigate the repo at review time — the lever that reaches the hard core
where passive context could not? This is the c-CRAB (arXiv:2603.23448) setting the SWE-Review
/ AACR-Bench line targets; existing review agents solve only ~40%, so there is headroom.

## 1. Design

Three arms on the **same** c-CRAB PRs (the review-agent benchmark our `crab-stage4.jsonl`
comes from — 184 Python PRs with `repo` + `base_commit` + human `reference_review_comments`
as ground truth), Haiku SUT, **1 trajectory/PR**, judged with **one** semantic cache (τ=0.7):

| arm | reviewer sees | source |
|---|---|---|
| diff-only | the PR diff only | `crab-structural-eval.ts` STRUCTURAL=0 (= doc-16 baseline) |
| static-context | diff + whole changed files + 1-hop deps (passive) | `crab-structural-eval.ts` STRUCTURAL=1 (= doc-16 Phase B) |
| **agentic** | the diff + **read-only tools** to inspect the repo at the review base | `crab-agentic-eval.ts` (this experiment) |

**Agentic loop** (`scripts/crab-agentic-eval.ts`): a ReAct loop over Bedrock Converse
**native tool-use**. The reviewer is given the diff and three read-only tools bound to the
PR's review-base commit, built on the blobless CRAB clone (`crab-repo-cache.ts`):
`read_file(path)` (whole file at base), `list_dir(path)` (`git ls-tree`), `grep(pattern,
path)` (`git grep`, pathspec-scoped so a blobless clone does not fetch every blob). It
inspects as needed, then calls `submit_findings`. Turn cap 12; on the final turn
`toolChoice` **forces** `submit_findings` so a long explorer always returns its findings.
Read-only by design — execution (running tests / reproduction) is the separate, sandbox-
gated experiment ③.

**Primary question:** does agentic recall exceed diff-only (and the passive static-context
null)? A win means active retrieval reaches issues neither the diff nor passive context did.

## 2. Results — full run N=158, 1 trajectory/PR, semantic τ=0.7

Full run (158 valid c-CRAB PRs; agentic vs diff-only, one judge cache):

| arm | R | P | F1 | findings/PR |
|---|---|---|---|---|
| diff-only (bar) | **36%** | 13% | 0.17 | 4.5 |
| **agentic** | 31% | **17%** | **0.20** | **2.6** |

Pilot (N=20, incl. a static-context arm) agreed in direction and is retained for reference:

| arm (pilot N=20) | R | P | F1 | findings/PR |
|---|---|---|---|---|
| static-context | 37% | 12% | 0.16 | 5.5 |
| diff-only | 43% | 16% | 0.22 | 5.1 |
| agentic | 35% | 20% | 0.24 | 2.9 |

Agentic tool usage: ~11.4 turns, ~12 tool calls/PR (it uses the budget). The pilot's static
arm reproduced doc-16's passive-context null (37% ≈ diff-only), so the full run dropped it.

- **Agentic does NOT clear the recall bar — at BOTH scales.** Full: R 31% < diff-only 36%
  (pilot: 35% < 43%). The primary hypothesis — active navigation reaches the hard core the diff
  misses — is **not supported**.
- **Agentic wins on precision and F1 — via SELECTIVITY, at both scales.** Full: P 17% vs 13%,
  F1 0.20 vs 0.17, at **2.6 findings/PR vs 4.5** (pilot: P 20 vs 16, F1 0.24 vs 0.22, 2.9 vs 5.1).
  It explores (~11 turns) then *prunes* concerns it cannot verify: read-only agency is a
  **verify-before-report** filter, not a coverage lever. The direction is identical at N=20 and
  N=158, so it is a property of the mechanism, not a small-sample artifact.

## 3. Interpretation

Both scales resolve to the same branch, with a twist worth stating precisely:
**read-only agency does not move recall on c-CRAB — it makes the reviewer more precise.** Given
the diff plus tools, Haiku spends its turns *checking* candidate concerns against the real
source and *dropping* the ones it cannot substantiate, so it emits ~40% fewer findings than the
diff-only reviewer at higher precision (full N=158: 17% vs 13%) and a better F1 (0.20 vs 0.17).
It does not surface *more* true issues (recall 31% ≤ 36%; pilot 35% ≤ 43%).

Why agency does not buy coverage here: (a) the ~15% hard-core (§10) is small, and read-only
navigation without execution cannot reach the runtime-manifesting part of it; (b) c-CRAB's GT is
the *specific* human review comment, and the smoke showed the agent finding **genuine but
off-target** issues (taipy-1042: "sorting a `Set` will fail", "parameter `sorted` shadows a
built-in" — real bugs on the *source* files, while the one human comment was on the *test*
file). Agency broadens and verifies understanding; it does not steer the reviewer to the one
line a specific human happened to comment on.

This lands agency alongside the doc-17 precision back-ends: like cross-family agreement (§7.1)
and aspect verification (§9), **agency trades recall for precision and gives the best F1 of its
group, but does not move the coverage frontier** — the recall ceiling (§8) holds. It reinforces,
rather than breaks, the decorrelation-and-bounds thesis: no diff-scoped mechanism we have tried
(sampling, filtering, verification, or read-only agency) clears the recall ceiling; the residue
(§10) needs *different tools* — a linter (§11, confirmed) for conventions, and for the functional
hard-core **execution**, not just navigation (experiment ③).

## 4. Caveats

- GT is **sparse + specific** (often 1 human comment/PR on one file); absolute recall is low
  for all arms and single-run (no union). The *relative* comparison on identical PRs is the
  signal, not the absolute numbers. (N=158 now, so small-sample noise is no longer the concern.)
- **Read-only** tools only; no execution (③). 1 trajectory/PR (no temperature/family union).
- **Large-repo latency (fixed):** on big repos (ansible) the agent's `grep`/`read_file` trigger
  on-demand blob fetches from the blobless clone; the run now caps every git op at 45s
  (`CRAB_OP_TIMEOUT_MS`) and writes runs incrementally + resumes, so a stall degrades one PR
  instead of hanging the run. (A model returning `submit_findings.findings` as a non-array also
  crashed the first attempt at PR 82 — now guarded; the resume reused the 81 persisted PRs.)
- Judge = the same Llama-3.3-70B semantic pair judge as elsewhere; findings→GT matching is
  file + line-range OR semantic ≥ τ.

## 5. Next

- **Full run done (N=158): verdict confirmed.** Scaling 8× did not overturn the pilot — agency
  ≤ diff-only on recall, higher precision/F1 via selectivity. No larger run needed for this
  question.
- **Experiment ③ (execution) is the better-motivated next lever.** The pilot shows *read-only*
  agency does not reach the hard core; the runtime-manifesting slice (races, dynamic-import
  failures, harmful deletions — §10) plausibly needs *running* the code, not just reading it
  (SWE-Doctor's bug-reproduction-test idea). Sandbox-gated.
- **Paper framing:** agency is reported as a **precision/verification** mechanism (best F1 of
  its group, no recall gain), NOT a validated coverage lever — so the doc-17 three-tools thesis
  keeps "execution/agency for the functional hard-core" as an *open* lever, with read-only
  navigation shown insufficient. This is why the paper realignment held agency as an open
  question rather than a confirmed win.
