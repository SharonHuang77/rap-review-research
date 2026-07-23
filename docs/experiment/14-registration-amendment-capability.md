# 14 — Registration Amendment: model-capability × defect-type interaction

**Status:** DRAFT for co-author sign-off (Sharon + advisor). NOT yet submitted to
OSF and NOT yet collected. This is a **pre-data amendment**: the Sonnet arm below
has NOT been generated on the confirmatory set; only a 20-PR pilot (excluded)
motivated it. It must be timestamped-registered and signed off **before** the
confirmatory Sonnet generation runs.
**Date:** 2026-07-22
**Amends:** `docs/experiment/04-preregistration.md` (adds one confirmatory
hypothesis family); reuses the frozen generation config `prompt-freeze-v1`
unchanged.
**Authors:** En-Ping Su, Tong Wu, Shiting Huang, Mengshan Li

---

## 1. Motivation

The confirmatory study froze a single system-under-test model (Haiku 4.5) and
listed single-model generalizability as a limitation. An exploratory 20-PR pilot
(2026-07-22) found that a stronger model's advantage is **not uniform across
defect types**: agentless ungrounded recall rose on **functional bugs**
(Haiku 61% → Sonnet 71%, Δ≈+10pp) but was **flat on rule/convention violations**
(≈33% both, Δ≈0). If confirmed, this locates the model-capability axis precisely
on the paper's functional-vs-rule split: capability buys reasoning-limited
functional detection, not mechanical convention detection. This is a clean,
one-variable confirmatory test (only the model changes) that strengthens the
core thesis with a scale dimension — and its result is scale-relevant precisely
as frontier models grow.

## 2. Hypotheses (confirmatory)

Unit = PR. Comparison = paired across the two models on the same instances, arm =
agentless, ungrounded, semantic recall (Llama 3.3 judge, τ=0.7), split by GT
defect type (rule = GT `category` present; functional = absent). Δ = Sonnet − Haiku.

- **H-cap-interaction (PRIMARY).** The capability gain is larger for functional
  bugs than for rule violations: **DiD = Δrecall_func − Δrecall_rule > 0**
  (one-sided). This is the identifying claim; it survives a global recall shift
  (a uniformly "better" model would give DiD ≈ 0).
- **H-cap-func (secondary).** Δrecall_func > 0 — the stronger model recovers more
  functional bugs.
- **H-cap-rule (secondary, EQUIVALENCE).** |Δrecall_rule| is within the
  pre-registered ±6-point SESOI (TOST) — capability does **not** materially change
  convention recall. A directional null, tested by equivalence, not by a
  non-significant p alone.

Guardrail (not a hypothesis): per-model precision is reported so a functional
recall gain is not a verbosity artifact.

## 3. Design

| Factor | Level |
|---|---|
| Manipulated variable | **SUT model only**: Haiku 4.5 vs Sonnet 4.5 |
| Arm | agentless, **ungrounded** (isolates the model; no grounding/topology confound) |
| Everything else | `prompt-freeze-v1` verbatim (v1 templates, temperature, maxTokens, snapshot, matcher, τ=0.7, dedup, eval) |
| Benchmark | Qodo PR-Review-Bench |
| N | **80-PR disjoint remainder** (the 99 confirmatory instances minus the ≤21 pilot PRs used to form this hypothesis) |
| Runs | 3 per (model, instance); per-PR value = mean of 3 |

- **Haiku baseline = already collected** under `prompt-freeze-v1`
  (`phase2-results/qodo-all-runs.json`); reused verbatim, zero new Haiku spend.
- **Sonnet arm = to be generated** under the identical frozen config, only the
  model id changed → the sole manipulated variable is capability.

Model ids (freeze; both pilot-confirmed region-enabled, us-east-1):
`us.anthropic.claude-haiku-4-5-20251001-v1:0`,
`us.anthropic.claude-sonnet-4-5-20250929-v1:0`. Judge:
`us.meta.llama3-3-70b-instruct-v1:0`.

## 4. Analysis plan

- Per (model, instance): mean-over-3-runs semantic recall, split by defect type.
- **Δrecall_func**, **Δrecall_rule**: paired Wilcoxon signed-rank + seeded
  percentile-bootstrap 95% CI; effect size = matched-pairs rank-biserial (paired)
  **and** Cliff's δ (unpaired), both reported. (`src/analysis/stats.ts`.)
- **H-cap-rule equivalence**: TOST against ±0.06 SESOI (`tostPaired`), plus the
  realized MDE at N via `mdePaired`.
- **DiD (primary)**: pooled rate-gap `[Σfunc]−[Σrule]` of (Sonnet−Haiku) with an
  instance-level bootstrap CI (whole-PR resampling), seed fixed.
- **Multiplicity**: Holm–Bonferroni within this new family {DiD, H-cap-func,
  H-cap-rule}; not pooled with the doc-04 families.
- Report macro and micro; precision by model×type as the guardrail.
- Zero new LLM calls at analysis time — everything replays from the persisted
  Sonnet runs + judge cache and the cached Haiku runs
  (`scripts/grounding-analysis.ts` with `ARMS=agentless`, per-model inputs).

**Power (a-priori).** At N=80, α=0.05 two-sided, power 0.80, and the registered
paired SD_diff ≈ 0.13 (doc-04 §3.2), the design detects a recall difference of
**≈4.1 points** (dz≈0.31). The pilot's functional Δ≈+10pp sits well above this;
the ±6-point rule SESOI is wider than the ≈±3.6-point CI half-width expected at
N=80, so a true rule Δ≈0 can be declared equivalent. Realized SD is reported and
N/SESOI revisited-and-logged if variance materially exceeds the prior.

## 5. Freeze & exclusions

- No new generation prompt: this arm is `prompt-freeze-v1` on a different model.
  Tag the Sonnet-arm config `capability-arm-v1` at sign-off (records model ids +
  the 80-PR instance list + judge id).
- **Exclusions:** the ≤21 pilot PRs (hypothesis-forming) are excluded from the
  confirmatory test; `Ghost-pr-4` excluded campaign-wide (persistent malformed
  JSON on agentless, per doc-04). Same PRs analyzed across both models (list-wise).

## 6. Threats to validity

- **Same-vendor caveat (important):** Haiku and Sonnet are the same family (Claude)
  → this tests **capability / scale within a family**, NOT cross-**vendor** model
  diversity. It is a capability axis, distinct from the cross-family
  *verification* axis (H-hetero); the two must not be conflated.
- **Precision/verbosity:** a functional recall gain with collapsed precision is not
  a clean capability win → precision reported as a guardrail.
- **Single benchmark:** Qodo injected defects; SWE-PRBench (human comments) is the
  natural external replication and may be added as a secondary check.
- **Golden-set incompleteness** (doc-12 §6): functional-bug recall is a lower bound;
  applies equally to both models, so the paired Δ is unaffected.
- **Semantic-matcher dependence:** τ=0.7 frozen; strict-vs-semantic stability is
  reported as elsewhere.

## 7. Explicitly OUT of this confirmatory (kept exploratory — honesty note)

- **Cross-family union × corroboration-depth, split by defect type** (functional
  union recall 80%, precision-by-depth 28/51/89%): the underlying Haiku/Kimi/GLM
  data is **already collected and already inspected**, so it **cannot** be
  retro-registered as confirmatory. It remains **exploratory** (doc-12 §5/§7,
  doc-13 §10.5). Only not-yet-collected data (the Sonnet arm) is eligible here.
- **The grounding arm** (doc-13) stays exploratory: its effect is weak (~5pp,
  ceilings ~40%) and not worth a confirmatory campaign; its contribution is the
  three-defect-class × three-lever map, not a confirmed grounding effect.

## 8. Estimated cost (for the sign-off decision)

Sonnet arm only (Haiku reused): agentless = 1 call/run × 80 PRs × 3 runs = **240
Sonnet calls** + one Llama judge pass over the new candidate pairs. On Sonnet 4.5
this is on the order of **~$10–30** (agentless single-call; no hierarchical, no
extra models). No further paid steps — analysis replays for free.

## 9. Run recipe (post-sign-off)

```
aws sso login --profile bedrock            # user
GROUNDED=0 ARMS=agentless RUNS_PER_INSTANCE=3 \
LLM_DEFAULT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0 AWS_PROFILE=bedrock \
GROUNDING_REPO=<repo> RUNS_OUT=... CACHE_OUT=... \
node scripts/grounding-judge-eval.ts       # per repo, over the 80-PR remainder
# then: grounding-analysis.ts (ARMS=agentless) for Δfunc / Δrule(TOST) / DiD by type
```
(The 80-PR remainder is selected by `PILOT_IDS`/exclusion list rather than the
pilot subset; the runner already filters by instance id.)
