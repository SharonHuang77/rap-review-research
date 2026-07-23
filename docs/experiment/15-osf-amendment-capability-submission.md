# 15 — OSF Registration Update: capability × defect-type (paste-ready)

**Purpose:** copy-paste content for the OSF **Registration Update** wizard on the
existing registration `2z4vj` (project "Multi-Agent Architectures for AI-Assisted
Code Review — Test-Time Compute Allocation", registered 2026-07-09 17:29, embargo).
Each `##` below maps to one wizard step/field. Full methodology: `doc-14`. It is a
**pre-data** update — submit BEFORE the confirmatory Sonnet 80-PR arm is generated.

> Coordination note (OSF warns "only one person edits a draft at a time"): agree
> with co-authors who drives the submission before editing.

---

## Step 1 — Justification For Update

This update is purely additive: it registers one new confirmatory hypothesis
family — a model-capability × defect-type interaction — without changing or
removing any original hypothesis. Using the identical frozen generation
configuration (git tag `prompt-freeze-v1`, commit 7d4d03e), the only additional
manipulated variable is the system-under-test model (Claude Haiku 4.5 vs Claude
Sonnet 4.5), with the arm fixed to agentless/ungrounded. The original registration
froze a single SUT (Haiku) and named single-model generalizability as a
limitation; an exploratory 20-PR pilot (Sonnet, excluded from confirmatory
analysis, hypothesis-forming only) indicated the stronger model's advantage
concentrates on reasoning-limited functional bugs and is absent on mechanical
convention/rule violations. We register this interaction before collecting the
confirmatory Sonnet data on the 80-PR disjoint remainder (the 99 confirmatory
instances minus the ≤21 pilot PRs). The Haiku arm is the already-collected
confirmatory data; only the Sonnet agentless-ungrounded arm is newly collected,
after this timestamp.

## Step 2 — Overview (Study Information / Hypotheses)

**Addition to the registered study.** Same PR sets, same frozen pipeline; adds a
capability contrast on the agentless (ungrounded) arm. Δ = Sonnet − Haiku, on
per-PR semantic recall (Llama 3.3 judge, τ=0.7), split by ground-truth defect type
(rule-violation = GT `category` present; functional-bug = absent).

- **H-cap-interaction (PRIMARY, one-sided):** the capability gain is larger for
  functional bugs than for rule violations — difference-in-differences
  DiD = Δrecall_func − Δrecall_rule > 0. (A uniformly "better" model gives DiD ≈ 0;
  this isolates the interaction from a global recall shift.)
- **H-cap-func (secondary, one-sided):** Δrecall_func > 0.
- **H-cap-rule (secondary, EQUIVALENCE):** |Δrecall_rule| lies within the
  pre-registered ±6-point SESOI (two one-sided tests) — capability does not
  materially change convention recall.

Only H-cap-interaction is the pre-specified primary of this family, carried through
multiple-comparison correction. Guardrail (not a hypothesis): per-model precision
is reported so a functional recall gain is not a verbosity artifact.

## Step 3 — Research Design

Study type: computational experiment (unchanged). Added manipulated factor: the
SUT model (2 levels: Haiku 4.5, Sonnet 4.5); the review arm is held fixed at
agentless/ungrounded and every other factor stays frozen at `prompt-freeze-v1`.
Design: within-item paired across the two models (every PR reviewed by both).
Blinding: the semantic-matching judge (Llama 3.3 70B, non-Anthropic) is a
different family than both SUTs and is not told which model produced a finding.
Randomization: none; agentless runs at temperature 0.

## Step 4 — Sampling

- **Existing data:** Registration prior to creation of the confirmatory Sonnet
  data. A 20-PR Sonnet pilot was run to form this hypothesis and is EXCLUDED from
  the confirmatory analysis (exploratory only); the Haiku confirmatory arm already
  exists (collected under `prompt-freeze-v1`) and is reused verbatim. No
  confirmatory Sonnet outcome on the 80-PR remainder has been observed.
- **Data collection:** frozen platform (`prompt-freeze-v1`), Sonnet id
  `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, agentless/ungrounded, 3 runs per
  PR, region us-east-1; judge `us.meta.llama3-3-70b-instruct-v1:0` precomputed and
  persisted.
- **Sample size:** the 80-PR disjoint remainder of Qodo (99 confirmatory minus the
  ≤21 pilot PRs). Same PRs across both models (list-wise).
- **Sample size rationale:** at N=80, α=0.05 (two-sided), 80% power, and the
  registered paired SD_diff ≈ 0.13, the design detects a recall difference of
  ≈ 4.1 percentage points (dz ≈ 0.31); the pilot's functional Δ ≈ +10pp is well
  above this, and the ±6-point rule SESOI exceeds the ≈ ±3.6-point CI half-width,
  so a true rule Δ ≈ 0 can be declared equivalent. Realized SD reported; N/SESOI
  revisited-and-logged if variance materially exceeds the prior.
- **Stopping rule:** no data-dependent stopping; the grid runs once (transient
  infrastructure failures retried, logged).

## Step 5 — Variables

- **Manipulated:** SUT model (Haiku 4.5 vs Sonnet 4.5). Arm fixed = agentless,
  ungrounded.
- **Measured:** per-PR semantic recall split by defect type (rule/functional);
  precision; F1; finding count. Per-run values averaged (3 runs → per-PR).
- **Indices:** defect type from GT `category` (present = rule-violation, absent =
  functional-bug). Recall = matched GT / GT of that type under the frozen matcher
  (file+line OR judge score ≥ τ=0.7). Dedup = `areDuplicateFindings`.

## Step 6 — Analysis Plan

- Unit = PR, paired across the two models. Δrecall_func and Δrecall_rule via paired
  Wilcoxon signed-rank + seeded percentile-bootstrap 95% CIs.
- **H-cap-rule** tested by two one-sided tests (TOST) against the ±0.06 SESOI; the
  realized minimum detectable effect at N reported alongside.
- **DiD (primary)** = pooled (micro) rate-gap [Σfunc]−[Σrule] of (Sonnet−Haiku),
  with a whole-PR (instance-level) bootstrap CI, seed fixed.
- Effect sizes: matched-pairs rank-biserial (paired) and Cliff's δ (unpaired),
  both reported. Macro and micro aggregations both reported.
- **Multiple comparisons:** Holm–Bonferroni within this family
  {H-cap-interaction, H-cap-func, H-cap-rule}; NOT pooled with the doc-04 families.
- **Data exclusion / missing data:** a (PR × run) excluded only on post-retry
  infrastructure failure; the ≤21 pilot PRs excluded; `Ghost-pr-4` excluded
  campaign-wide (persistent malformed JSON on agentless). List-wise at the PR level.
- Analysis replays deterministically from persisted runs + judge cache (zero new
  LLM calls); precision by model×type reported as the verbosity guardrail.

## Step 7 — Other

- **Freeze:** no new generation prompt — this arm is `prompt-freeze-v1` on a
  different model; the Sonnet-arm config is tagged `capability-arm-v1` at
  submission (records the two model ids, the 80-PR instance list, and the judge id).
- **Same-vendor caveat:** Haiku and Sonnet are the same family (Claude); this tests
  capability/scale WITHIN a family, NOT cross-vendor model diversity — it is a
  distinct axis from the cross-family verification result and must not be conflated.
- **Explicitly kept exploratory (not part of this confirmatory family):** (a) the
  cross-family union × corroboration-depth analysis split by defect type — its
  Haiku/Kimi/GLM data is already collected and inspected, so it cannot be
  retro-registered as confirmatory; (b) the grounding arm (doc-13). Both are
  reported as exploratory.
- SWE-PRBench (human-comment agreement) is a candidate secondary external
  replication of the interaction, reported exploratorily if run.

## Step 8 — Review & Submit

Confirm the additions above, keep the embargo, submit. The immutable update
timestamp must predate the confirmatory Sonnet generation; the run artifacts carry
`generatedAt`, so the ordering (update < data) is auditable.
