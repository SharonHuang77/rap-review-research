# 13 — Grounding Arm: does project context beat topology? (proposal + pilot)

**Status:** Proposal for co-author review. NOT yet a registration amendment; the
pilot below runs BEFORE any freeze and informs a later confirmatory registration.
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
