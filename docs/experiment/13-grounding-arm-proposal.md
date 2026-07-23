# 13 — Grounding Arm: does project context beat topology? (proposal + pilot)

**Status:** Proposal + **pilot COMPLETE (2026-07-22)** — see §10 (results) and §11
(synthesis). Still NOT a registration amendment; the pilot is exploratory (n≈20)
and informs the confirmatory design in §12. §§1–9 are the pre-pilot design and
the §9 prediction was registered before the pilot was read.
**Date:** 2026-07-22
**Authors:** En-Ping Su, Tong Wu, Shiting Huang, Mengshan Li
**Relation to the registered study:** a NEW generation condition (it changes the
model input), so it is out of scope for `prompt-freeze-v1` and would carry its own
freeze tag `grounding-freeze-v1`. It reuses the frozen evaluation pipeline (Llama
3.3 finding→GT judge at τ=0.7) unchanged, per the double-freeze line (doc 03/11).

---

## 1. Motivation

The confirmatory study established two things that make this experiment the
natural next question:

1. **Homogeneous multi-agent topology adds no quality** (H-specialization null,
   equivalent within ±6pp; Agentless is F1-dominant). More agents of the same
   model buy recall at a net-negative precision cost.
2. **The signal is defect-type-specific** (doc 12 §5): cross-family reviewers
   recover *universal functional bugs* far more often than *project-specific rule
   violations* (recall-at-≥1 **80% vs 45%**). A null dereference is legible from
   the diff; a repository convention is invisible to a reviewer that has never
   seen the project's standards.

That asymmetry is a **grounding** deficit, not a capability or topology deficit.
It predicts that the lever with the most headroom is not more agents but more
*context*: give the reviewer the project's conventions and the rule-violation
blind spot should shrink. This experiment tests exactly that, and pits it head to
head against topology — the paper's framing question, "does environment beat
architecture?"

## 2. Research question and hypotheses

**RQ-ground.** Holding the model and evaluation fixed, does supplying
project-derived conventions to a single-pass reviewer improve review quality, and
specifically does it close the rule-violation gap that topology does not?

- **H-ground (primary).** Grounded Agentless recovers more **rule-violation** GT
  than ungrounded Agentless (per-PR recall, one-sided; the registered direction).
- **H-ground-specificity (identifying).** The grounding gain is **larger for
  rule-violations than for functional bugs**. Functional bugs are the built-in
  control: they are diff-legible and should move little. The *difference-in-
  differences* — Δrecall(rule) − Δrecall(functional) — is the real test. If both
  types rise equally the effect is "more context ⇒ more findings," a generic
  verbosity confound, **not** grounding filling the convention blind spot.
- **H-ground-vs-topology.** Grounded Agentless matches or beats **ungrounded
  Hierarchical/Consensus** on rule-violation recall and on F1 — grounding as a
  cheaper substitute for topology. (Topology arms already exist; no new runs.)
- **H-ground×topology (interaction).** Grounding a specialized topology
  (Hierarchical) adds *less* than grounding the single-pass reviewer — i.e.,
  grounding and topology are substitutes, not complements (the gain does not stack).

Secondary/guardrail: grounded precision does not collapse (a convention list must
not turn the reviewer into a nitpick generator); cost (calls/tokens) is unchanged
by construction for Agentless (still one call, longer input).

## 3. Grounding operationalization (the crux)

**Convention source = repository-derived (co-author decision, 2026-07-22).** For
each benchmark repository we build a `ProjectConventions` document from the
project's own artifacts, in priority order:

1. Machine-readable config in the repo: `.editorconfig`, linter configs
   (`.eslintrc*`, `.roslynator`, `analyzers`, `StyleCop`, `Directory.Build.props`
   rulesets), formatter settings.
2. Human docs: `CONTRIBUTING*`, `CODING_GUIDELINES*`, `docs/**/style*`.
3. Fallback: an LLM-summarized "house style" distilled from a sample of the
   repo's own source (NOT the PR under review), capped to a fixed token budget.

The document is **repo-level and instance-blind**: it is assembled once per
repository and contains no reference to the specific PR or its injected defect.

**Non-circularity.** The reviewer is never told which rule this diff violates, nor
given the GT `category` of the instance. It receives the project's general
convention set and must still decide whether the diff violates any of them. Using
the injected rule name would be leakage and is prohibited.

**Injection into the pipeline.** A `## Project conventions` block is prepended to
the review *input* (user message), leaving the frozen `agentless/system.md` and
`common/review-instructions.md` untouched. This is an additive input change ⇒ a
new generation condition ⇒ `grounding-freeze-v1`, not a mutation of
`prompt-freeze-v1`.

## 4. Design

| Factor | Levels |
|---|---|
| Architecture | Agentless, Hierarchical |
| Grounding | ungrounded (existing), grounded (`+conventions`) |
| Model (frozen) | Claude Haiku 4.5 (SUT) |
| Benchmark | Qodo PR-Review-Bench (carries the functional/rule GT labels — required) |

- **Conditions run new:** `agentless+conventions`, `hierarchical+conventions`.
  **Reused (no new runs):** `agentless`, `hierarchical` (and `consensus` for the
  topology comparison) from the confirmatory campaign.
- Each (PR × condition) run **3 times**; per-PR value = mean of 3 (matches §3.3).
- **Held constant:** model, evaluation pipeline + Llama judge cache seam, τ=0.7,
  PR snapshot, JSON schema, dedup, matcher. Only the conventions block varies.
- **Metrics** (via the existing `GroundTruthEvaluator`, semantic matcher):
  per-PR recall **split by GT type** (rule vs functional — the `category`-present
  split from `phase3-hetero-by-category.ts`), precision, F1, finding count.

## 5. Identifying logic and confounds

- **Functional bugs are the placebo.** The claim is not "grounding raises recall"
  (a verbose reviewer does that); it is "grounding raises *rule* recall
  *specifically*." The diff-in-diff isolates the convention mechanism from generic
  verbosity. Report both the rule Δ and the functional Δ with CIs; the headline is
  their difference.
- **Coverage pre-flight (guards a false null).** If the repo-derived conventions
  do not actually cover the injected rule categories, grounding cannot help and we
  would get a null *for the wrong reason*. Before any review runs, compute the
  **coverage rate**: of the injected rule-violation `category` values in the pilot
  set, what fraction is expressible in the extracted `ProjectConventions`? Report
  it; if coverage is low the injected rules are not the repo's real conventions and
  the benchmark — not grounding — is the limiting factor (a finding in itself, and
  a reason to prefer a natural-convention benchmark for the confirmatory arm).
- **Precision guardrail.** A convention list can inflate false positives. Track
  precision and the functional-bug false-positive rate; a rule-recall gain bought
  by a precision collapse is not a win.
- **Context-length confound.** Grounded inputs are longer; any gain could be a
  length artifact. Mitigation: the functional-vs-rule diff-in-diff (length would
  lift both); optionally a length-matched placebo (an equal-token block of
  *irrelevant* project prose) in the confirmatory arm.

## 6. Threats to validity

- **Injected ≠ natural conventions.** Qodo's rule-violations may be synthetic
  rather than the repo's real house style; the coverage pre-flight quantifies
  this. The natural-convention external check is SWE-PRBench (human comments) and,
  later, the industrial arm.
- **Extraction quality.** LLM-summarized house style may be noisy; prefer
  machine-readable configs where present and report which source each repo used.
- **Single model / single benchmark** for the pilot — generalizability stated, not
  claimed; the confirmatory arm would add the Sonnet robustness check.
- **New generation condition** ⇒ not covered by the existing pre-registration; the
  confirmatory version requires its own registered hypotheses + `grounding-freeze-v1`
  + co-author sign-off before paid collection.

## 7. Pilot plan (exploratory — informs the design, NOT a confirmatory result)

Run on the **20-PR pilot subset** already excluded from the confirmatory analysis
(the `PILOT_EXCLUDE` set), so nothing contaminates a future confirmatory run.

- **P0 — Convention extraction + coverage pre-flight.** Build `ProjectConventions`
  for the pilot repos; report source used per repo and the injected-rule coverage
  rate. **Go/no-go:** if coverage < ~50%, stop and switch the confirmatory arm to a
  natural-convention benchmark rather than run a doomed null.
- **P1 — Feasibility.** `agentless+conventions` runs end-to-end; inputs stay within
  context limits; findings parse and persist; replay is zero-cost.
- **P2 — Effect + specificity.** 20 PRs × {agentless, agentless+conventions,
  hierarchical, hierarchical+conventions} × 3 runs (new generation ≈ 120
  grounded reviews on Haiku; ungrounded reuses cached runs where available).
  Report per-type recall, the rule−functional diff-in-diff, precision, F1;
  compare grounded-agentless vs existing ungrounded-hierarchical/consensus.
- **P3 — Calibration for confirmatory power.** Measure the paired per-PR SD of the
  rule-recall difference to size a later confirmatory N (reusing the §3.2 MDE
  machinery, `scripts/phase3-equivalence.ts` primitives).

**Cost:** ~120 grounded Haiku reviews + one convention-extraction pass per repo.
Well under a few dollars on Haiku; ungrounded arms are already paid and cached.

## 8. Analysis plan

- Unit = PR; paired Wilcoxon signed-rank on per-PR type-split recall differences;
  seeded percentile-bootstrap 95% CIs (reuse `src/analysis/stats.ts`).
- **Primary estimand:** the difference-in-differences
  `[recall_rule(grounded) − recall_rule(ungrounded)] − [recall_func(grounded) − recall_func(ungrounded)]`,
  with a bootstrap CI over PRs.
- Effect size: matched-pairs rank-biserial (paired) + Cliff's δ (unpaired), both.
- Holm–Bonferroni within the grounding hypothesis family; report macro and micro.
- All numbers replay deterministically from persisted grounded runs + judge cache.

## 9. Prediction (registered before the pilot is read)

Grounding lifts **rule-violation** recall materially (target ≥ +10pp) while
**functional-bug** recall moves < +3pp; grounded-Agentless reaches or exceeds
ungrounded-Hierarchical on rule recall and F1; grounding × topology is
sub-additive. If instead both types rise together, we conclude *verbosity*, not
grounding; if neither moves, the coverage pre-flight tells us whether the cause is
grounding or the benchmark's synthetic conventions.

---

## 10. Pilot results (2026-07-22, exploratory, n≈20)

Haiku 4.5 SUT; 20-PR pilot subset; grounded runs generated live, ungrounded
baseline reused byte-identically from the cached confirmatory
`qodo-all-runs.json`. All recall is semantic (Llama judge, τ=0.7). Every number
below replays from persisted runs/caches; scripts:
`grounding-coverage-preflight.ts`, `grounding-judge-eval.ts`,
`grounding-analysis.ts`, `grounding-func-misses.ts`,
`phase3-hetero-by-category.ts`, `phase3-borrowed-metrics.ts`.

**P0 coverage pre-flight = GO:** repo-derived conventions cover **100%** of the
pilot's injected rule categories (aspnetcore 30/30, Ghost 18/18) — the injected
rules ARE the repos' real house style, so a null reflects grounding, not a
benchmark artifact.

### 10.1 Grounding effect — directional, underpowered; ceilings ~40%
Difference-in-differences (Δrecall_rule − Δrecall_func); functional bugs are the
placebo (should not move):

| model, agentless | rule ung→grounded | func ung→grounded | DiD | verdict |
|---|---|---|---|---|
| Haiku | 33→38 (Δ+4.9, CI[0.0,12.2]) | 61→60 (Δ−0.6) | +5.5, CI[−8.3,22.2] | not sig |
| Sonnet | 31→37 (Δ+6.0, CI[−0.7,14.7]) | 71→66 (Δ−4.8) | +10.8, CI[0.9,22.2] | sig, but driven by the func drop |

Hierarchical grounding: null (rule Δ≈0). The rule gain is real but **modest and
ceilings at ~37–40%**; Sonnet's significant DiD comes largely from a functional
recall **trade-off** (grounding reallocates a fixed attention budget), not a big
rule jump. Grounded-hierarchical did not beat grounded-agentless (grounding and
topology are sub-additive).

### 10.2 The ceiling is NOT suppression (audit probe)
Reframing the task from "review this PR" to a lint-only convention audit ("flag
EVERY violation; nitpicks are the target") barely moved rule recall
(**38→40%**). Of the audit's missed rule-violations, **12/21 had no flag anywhere
in the file** (only 1 was a localization/matching near-miss); the missed cases are
mechanical/config — a double-quoted import specifier, JSON indentation, an i18n
filename. So the limit is **genuine recognition/behavior** (LLM reviewers do not
do exhaustive line-by-line mechanical scanning), not prioritization/suppression
and not a measurement artifact.

### 10.3 Capability axis (Sonnet vs Haiku, ungrounded, paired, n=19)
| defect type | Haiku | Sonnet | Δ(Sonnet−Haiku) |
|---|---|---|---|
| rule (mechanical) | 33% | 33% | −0.7pp, CI[−8.7,8.3] |
| func (reasoning) | 61% | 71% | **+10.1pp** (CI includes 0 at n=19) |

Capability buys **functional-bug** recall (reasoning) and **~nothing** on
conventions (mechanical). Grounded rule recall converges to a common ~37% ceiling
across both models — a wall capability does not build.

### 10.4 Functional-bug miss anatomy (53 func GT, agentless ungrounded)
both-catch 53% · **Sonnet-only 19%** · Haiku-only 9% · **both-miss 19%**.
- **Sonnet-only (capability unlocks):** local logic-heavy reasoning — off-by-one,
  inverted `!==`→`===`, missing branch call, races/disposal order, `floor`-vs-`round`,
  platform-specific path comparison.
- **both-miss (shared hard core):** bugs needing information **outside the diff**
  (wrong `require` path — file's real name not visible), **harmful deletions**
  (removed try-catch / equality check), cross-file consistency, deep domain/library
  semantics, and non-salient files (tests, i18n). Haiku-only (9%) shows the two
  models even trade misses on this class → it is capability-invariant.
- (Haiku and Sonnet are the SAME family, so 19%+9%=28% "only-one-caught"
  UNDERSTATES cross-vendor decorrelation.)

### 10.5 Cross-family, by defect type (confirmed 80-PR data, for contrast)
Union recall (≥1 family) and precision by corroboration depth, Haiku/Kimi/GLM:

| | ≥1 (union) | ≥2 | ≥3 |
|---|---|---|---|
| functional recall — cross-family | **80%** | 61% | 43% |
| functional recall — same-model×3 | 71% | 70% | 69% |
| rule recall — cross-family | 45% | 26% | 18% |
| precision at depth (all) | 28% | 51% | **89%** |

Cross-family **union** lifts functional recall to 80% (vs 71% for 3 runs of one
model — error decorrelation), and agreement **depth** is a precision instrument
(28→89%). Rule recall stays low (45%) even unioned — conventions are a shared
blind spot. The ≥2-family "trustworthy" set is 72% precise (52% func-TP / 20%
rule-TP / 28% FP).

## 11. Synthesis — three defect classes, three levers

| defect class | binding lever | pilot/confirmed evidence | does NOT help |
|---|---|---|---|
| **conventions / rules** | deterministic **lint** | capability Δ≈0 (Haiku=Sonnet 33%); grounding ceilings ~40%; audit=40% (not suppression); misses are mechanical/config | more capability, grounding, homogeneous agents |
| **functional · reasoning-contained** | model **capability** + **cross-family union** | Sonnet +10pp func; cross-family union 80% vs same-model 71%; depth-3 precision 89% | conventions-grounding |
| **functional · hard core** (cross-file / harmful deletion / needs-execution) | **grounding (repo context) + execution** | both-miss 19%; needs info outside the diff; capability- and family-invariant | more capability, more families (cannot manufacture absent information) |

Negative lessons that constrain the design (from the confirmatory arm): homogeneous
topology adds no quality (H-specialization null), and same-model self-consistency
does not rescue (H-verify null) — so the productive verification must be
**cross-family**, not same-model repetition.

**Headline:** no single "bigger model" or "more homogeneous agents" spans the three
classes; each needs a different lever (lint / capability+cross-family / execution).
The grounding arm's contribution is not "grounding helps" (it is a weak ~5pp lever
that ceilings at 40%) but this **map of which lever each defect class requires.**

## 12. Confirmatory implications (revised by the pilot)

- **Run on the frontier model at large N.** Capability-dependent magnitudes shift
  with scale (Haiku→Sonnet already moved func +10pp); the reasoning-contained
  results measured on Haiku may not transfer. Structural results (conventions
  capability-invariant; cross-family precision from independence) are scale-robust.
- **Grounding arm:** full 80-PR set + a **lint-hybrid baseline** (deterministic
  linter as the convention oracle) + a length-matched placebo block; report recall
  by type + precision + the func trade-off as a joint outcome.
- **Reframed registered question:** not "does grounding help?" but "**LLM + linter
  + execution division of labor vs pure-LLM grounding**" — which lever pays for
  which defect class.
- Two follow-ons the pilot motivates: cross-family **union×depth by defect type at
  scale** (the confirmed 80/45 + 28/51/89 numbers, powered), and the func **hard
  core under execution grounding** (c-CRAB direction).

## 13. Update — confirmatory, lint, and structural-context results (2026-07-23)

Three follow-up studies revise the §10–§11 pilot conclusions. Sources:
`docs/experiment/14` §10 (capability confirmatory), `scripts/lint-baseline.ts`,
`docs/experiment/16` (CRAB structural grounding).

- **§11 "capability Δ≈0 on rules" does NOT generalize.** The registered capability
  arm (doc-14 §10; Sonnet vs Haiku, disjoint 80-PR set) found capability lifts
  **both** defect types modestly (func +3.4pp, rule +5.2pp; DiD = −1.8pp, n.s.).
  The pilot's functional-specific interaction holds only on the 2 pilot repos
  (DiD +10.8pp) and vanishes elsewhere → **repo-moderated, not universal**. Revise
  the §11 lever map: capability = a **broad modest lift**, not a functional-only
  one; conventions stay hardest in absolute terms (rule recall still ~37%).
- **"conventions → deterministic lint" refines to a within-conventions split.**
  A non-circular lint baseline (faithful re-implementations of the repos' published
  ESLint/editorconfig/analyzer rules, applied blind to the full diff; pilot repos,
  50 rule-GT) gives: **mechanical/syntactic** conventions → deterministic checker
  beats the LLM (async-suffix **43% vs 7%**, strict-equality 100% vs 0%, single-
  quote 50% vs 0%); **framework/policy/conceptual** conventions (xUnit, Tailwind
  order, TS-strict, sealed, curly-braces, primary-ctor) → the LLM wins (≈100%),
  a line-local linter can't reach them. They are **complementary**: lint 30% / LLM
  32% / **hybrid(lint∪LLM) 50%**. So the lever is "**mechanical→lint,
  conceptual→LLM**," not "conventions→lint" wholesale.
- **Static grounding fails regardless of content quality.** Beyond the ~5pp
  hand-written-convention lever here, feeding **real whole files + 1-hop
  dependencies** (doc-16, CRAB) also does **not** lift recall (semantic 37%→35%,
  n.s.), though it changes 45/50 outputs. Passive context injection is not the
  lever; **agency** (adaptive retrieval / execution) is (SWE-Review; *Beyond Code
  Snippets*). The "grounding" row of the §11 map should read **grounding via an
  agentic reviewer with repo tools + execution**, not static prepend.
