# 16 — Structural-retrieval grounding on CRAB (Phase B)

**Status:** DESIGN (approved to build 2026-07-23). EXPLORATORY — a new benchmark
(CRAB), not the registered confirmatory. Does NOT touch `prompt-freeze-v1`.
**Motivation:** the static-prepend grounding arm (doc-13) was a weak ~5pp lever.
The 2026 literature (AACR-Bench; *Beyond Code Snippets* repo-QA; SWE-Review) says
the mechanism was wrong: whole-repository review needs **structured retrieval of
real code**, not hand-written conventions prepended to the diff — and many review
findings sit on **unchanged lines / need cross-file context the diff omits**
(confirmed on our own Qodo data, doc-14 §confirmatory-followup / lint-baseline).
This phase tests whether feeding the reviewer **whole changed files + their 1-hop
local dependencies** (retrieved from the repo at review time) lifts review recall
over diff-only — isolating "context content," single-shot, before any agent loop.

## 1. Why CRAB (not Qodo)

Qodo instances carry only `id, pr_title, diff, issues` — no repo/commit, so no
file beyond the diff can be retrieved. CRAB (`data/benchmark/crab-stage4.jsonl`,
184 Python PRs / 67 public repos) carries `repo`, `base_commit`,
`commit_to_review.patch_to_review`, and `reference_review_comments` (real human
review, with `path`+`line`+`text`). `git show <base_commit>:<path>` on a blobless
clone returns the exact review-time file (validated: OpenHands logger.py, 401
lines, line 21 aligns with the comment's `original_line`). Trade-off: CRAB is a
DIFFERENT benchmark (human conversational comments, Python-only, noisier GT) — so
results are NOT directly comparable to the Qodo arms; they are external-validity
evidence for the context lever, reported as such.

## 2. Design

| Factor | Level |
|---|---|
| Benchmark | CRAB, N=50 subset (diff ≤ 40 KB, ≥1 located comment, `base_commit` reachable, repo clones) |
| Manipulated variable | **context only**: `diff-only` vs `structural` |
| Arm / model | agentless, Haiku 4.5 (frozen SUT), 3 runs/instance, temp 0 |
| `diff-only` | base `PromptBuilder` — byte-identical to `crab-pilot.ts` |
| `structural` | diff **+** whole changed file(s) at `base_commit` **+** 1-hop local imports, token-budgeted |
| Eval | semantic judge (Llama 3.3, τ=0.7) primary; strict file+line secondary |
| Metrics | recall, precision, findings/PR, **context token cost**; paired by instance |

**Structural context (non-circular, GT-blind).** Built ONLY from diff-touched
files and their imports — never from the review comments:
1. Parse the diff → set of changed files.
2. For each changed file: `git show <base>:<file>` → whole file.
3. Parse the file's Python imports (`import a.b`, `from a.b import c`,
   `from .m import x`) → resolve to repo-relative module files (1 hop) → `git show`
   each that exists in the repo (skip stdlib/third-party). Cap to K=5 modules.
4. Assemble `## Full source of changed files (review base)` +
   `## Referenced local modules (1-hop)`, truncated to a ~8 K-token budget
   (changed files prioritized over dependencies).

`structural=off` falls back to the base builder → diff-only, so the ONLY variable
is the injected context.

## 3. Components

- `src/grounding/crab-repo-cache.ts` — blobless clone per repo under
  `CRAB_CLONE_DIR` (default `C:\Users\chntw\crabrepos`, gitignored; short path to
  dodge Windows MAX_PATH); `fileAtCommit(repo, commit, path)` via `git show`, with
  a `git fetch origin <commit>` fallback and a null return on failure.
- `src/grounding/structural-context.ts` — `buildStructuralContext(instance)` →
  the token-budgeted block above; pure given the cache.
- `scripts/crab-structural-eval.ts` — load N CRAB instances (reuse crab-pilot
  parsing), generate both conditions via `CampaignRunner` (env `STRUCTURAL=0/1`),
  Llama judge pass, persist runs+cache to `crab-arm/` (gitignored), print macro.
- `scripts/crab-analysis.ts` — paired diff-only vs structural: recall/precision/
  findings/token-cost; semantic τ=0.7 + strict; seeded bootstrap CI.

## 4. Non-circularity & freeze

Retrieval keys on diff-touched files + their imports only; the reviewer is never
shown the comment text or its line. New generation code lives outside
`prompt-freeze-v1`; the `diff-only` condition reproduces `crab-pilot.ts` content.

## 5. Cost

Clone/retrieval: free (network + disk; blobless clones are small, blobs on demand).
Generation: 2 conditions × 50 PRs × 3 runs = **300 Haiku calls** + one Llama judge
pass ≈ **$10–30**. Analysis replays for free.

## 6. Risks / mitigations

- `base_commit` force-pushed/unreachable → `git fetch` fallback, else skip+log.
- Large repos slow to clone → per-clone timeout; skip+log; N backfilled from the
  next passing PRs.
- Whole files large → token budget with truncation (changed files first).
- Human-comment GT is conversational/noisy → semantic judge primary; a sample of
  matches is eyeballed; recall reported as a soft lower bound.
- Python-only, 67 repos → findings are Python/CRAB-specific; reported as external
  validity, not a Qodo-comparable number.

## 7. Phase A (later, only if B shows signal)

If whole-file+deps context lifts recall on non-local findings, build a tool-use
(ReAct) reviewer with repo tools (read/grep/deps/execute) per SWE-Review, to test
whether **agency** (adaptive retrieval) adds over static structural context.

## 8. Results (Phase B, collected 2026-07-23) — NULL

N=50 CRAB PRs, Haiku agentless, 3 runs, diff-only vs structural (whole changed
files + 1-hop local deps at the review base; 48/50 PRs got context, mean ~5.6K
tok; getsentry/sentry failed to clone → 2 PRs fell back to diff-only). Paired,
Δ = structural − diff-only (`crab-analysis.ts`).

| matching | diff-only R | structural R | Δrecall | precision | findings/PR |
|---|---|---|---|---|---|
| semantic (τ=0.7) | 37% | 35% | **−1.2pp**, CI[−11.9, +9.6], p=0.58 | 15%→14% | 4.8→4.8 |
| strict (file+line) | 22% | 17% | −5.4pp, CI[−15.4, +4.8], p=0.82 | 7%→5% | 4.8→4.8 |

**Static structural context does not lift review recall** (both CIs span 0; a hair
lower if anything). This is **not** a plumbing artifact: 45/50 instances produced
*different* findings under the two conditions (sanity check) — the ~5.6K-token
context WAS injected and changed *what* the model flags, just not *how well* it
matches human review. Attention shifted; net quality did not move.

**Interpretation.** The earlier grounding null (doc-13: hand-written conventions)
is **not** explained by wrong content — real whole-file + dependency context does
not help either. **Passive context injection is not the lever, independent of
content quality.** This is a controlled, code-review-specific confirmation of the
2026 repo-QA finding (*Beyond Code Snippets*: brute-force context inclusion fails;
deliberate exploration is what helps) and points the lever at **agency** (adaptive
retrieval / call-chain following / execution, per SWE-Review) — i.e. Phase A.

**Caveats.** Weak SUT (Haiku — a stronger model may use long context better,
though repo-QA reports the effect model-general); CRAB human comments are
conversational/noisy (recall is a soft lower bound); the paired Wilcoxon had n=12
non-tied PRs (low power) — but the point estimate + the findings-changed sanity
check agree on "no improvement."

**Decision.** Phase A (build a ReAct reviewer with repo tools) is deferred: this
null plus the published SWE-Review result already make the case that agency, not
context volume, is the lever. The paper reports the diff-scoped regime + its
ceiling and cites agency as the resolution; Phase A stays future work unless an
own-data agentic result is wanted.
