# Pre-Registration — Multi-Agent Architectures for AI-Assisted Code Review

**Status:** Draft for co-author review (not yet submitted to OSF)
**Date:** 2026-07-08
**Authors:** En-Ping Su, Tong Wu, Shiting Huang, Mengshan Li
**Registers:** the confirmatory study run on the frozen platform (see `docs/optimization/00-roadmap.md`, Phases 1–3).

> This document is the **authoritative, up-to-date methodology**. Where it
> conflicts with `01-experiment-plan.md` / `02-benchmark-selection.md` /
> `../architecture/03-experimental-design.md` (written before the control arm and
> the test-time-compute reframing), **this document wins**. It is written in the
> OSF pre-registration structure so it can be submitted before the frozen
> campaign begins.
>
> **Decision status:** all four framing decisions are now **RESOLVED** in-line
> (primary hypothesis H2, an exploratory model-scale 5th arm, sample sizes +
> power, and the A2 LLM-judge matcher). What remains before OSF submission is
> co-author sign-off, finalizing the power paragraph on the pilot's measured
> variance (§3.2), confirming the judge model id (§5.1), and the prompt freeze.

---

## 1. Study information

### 1.1 Title
Does more coordination pay off? A controlled comparison of communication
topologies for LLM-based code review, at matched test-time compute.

### 1.2 Research questions
- **RQ1 (compute):** Does spending more test-time compute on a single-agent
  reviewer (3 independent generalist samples + merge) improve review quality
  over one sample?  *(agentless vs generalists-3)*
- **RQ2 (specialization):** Given equal agent count and an identical merge, does
  splitting reviewers into specialized roles improve quality? *(generalists-3 vs
  hierarchical)*
- **RQ3 (communication):** Does adding inter-agent communication (exchange,
  revision, voting) improve quality over independent specialists? *(hierarchical
  vs consensus)*
- **RQ4 (trade-off):** Which arm gives the best quality per unit cost
  (tokens / USD / critical-path latency)?

This decomposition is the study's contribution: prior work confounds *compute*,
*specialization*, and *communication*. The `generalists-3` control arm isolates
them into a one-variable-per-rung ladder:

```
agentless ──RQ1:+compute──▶ generalists-3 ──RQ2:+specialization──▶ hierarchical ──RQ3:+communication──▶ consensus
```

### 1.3 Hypotheses
- **H2 (specialization) — PRIMARY confirmatory.** hierarchical > generalists-3 in
  recall, at comparable precision (role prompts probe distinct issue classes).
- **H1 (compute) — secondary.** generalists-3 ≥ agentless in recall (more samples
  surface more true issues).
- **H3 (communication → precision) — secondary.** consensus > hierarchical in
  precision (voting filters false positives), at the cost of the most tokens/latency.
- **H4 (cost monotonicity) — secondary.** cost (tokens, USD, sum-of-calls latency)
  increases monotonically along the ladder; critical-path latency does **not**
  (parallel rounds).
- **H5 (diminishing returns) — exploratory.** the quality gain per added dollar
  decreases along the ladder — the largest marginal gain is early (RQ1/RQ2), the
  smallest late (RQ3).

**✅ DECISION 1 — RESOLVED.** The single **primary confirmatory** hypothesis is
**H2** (specialization effect: hierarchical vs generalists-3 recall). It is the
study's most novel and least-tested claim, and it is publishable in *both*
directions: confirming it shows role specialization adds value beyond raw
compute, while a null result is itself a strong finding — "the apparent
multi-agent advantage is just more sampling, not the topology." H1/H3/H4 are
secondary confirmatory (tested but not the headline); H5 is exploratory
(descriptive, via the RQ4 Pareto analysis). Only H2 carries the study's main
confirmatory claim through the §5.2 multiple-comparison correction as the
pre-specified primary.

---

## 2. Design plan

### 2.1 Study type
Observational/computational experiment. The manipulated factor is the review
**architecture**; every other factor is held constant (§4.2).

### 2.2 Blinding
Not applicable to generation. For any LLM-as-judge matching (§5.3), the judge is
a **different model family** than the systems under test and is not told which
arm produced a finding.

### 2.3 Independent variable
Review architecture. The four ladder levels — `agentless`, `generalists-3`,
`hierarchical`, `consensus` — are the **confirmatory** treatments; adjacent
levels differ by exactly one factor (§1.2). A fifth **exploratory** arm,
`agentless-large`, is also run (see DECISION 2).

**✅ DECISION 2 — RESOLVED (included as exploratory, Qodo-only).** Add a fifth arm
**`agentless-large`**: the agentless prompt on a larger model (e.g. Opus-class)
at cost matched to the 3-small-agent arms — the "1 big model vs 3 small agents at
equal cost" cell, the most practitioner-relevant and least-studied point in the
test-time-compute space. It is registered as **exploratory, not confirmatory**,
because "equal cost" across model generations is an approximation (price is not a
clean proxy for capability) that would otherwise dilute the H2 correction and
invite reviewer disputes over the matching. Scope-limited to **Qodo (100 PRs)
only** (not SWE-PRBench/RAP) to cap the added spend; one call per PR × 3 runs.
Its cost-parity budget (target output tokens / calls to match a small-model
3-agent arm) is fixed at the freeze and reported.

---

## 3. Sampling plan

### 3.1 Data collection status
No confirmatory data collected yet. A ≤5-PR pilot (excluded from confirmatory
analysis) will validate the pipeline and calibrate cost before the freeze.

### 3.2 Datasets & sample sizes
| Dataset | Purpose | Target PRs |
|---|---|---|
| Qodo PR-Review-Bench | objective correctness (P/R/F1/localization) | **100** (full set) |
| SWE-PRBench | human-reviewer agreement | 25 |
| RAP Portal | industrial case study (operational metrics only) | 15 |

Each PR is reviewed by the four confirmatory arms, each run **3 times** (§3.3);
the exploratory `agentless-large` arm runs on Qodo only. Qodo is the primary
confirmatory benchmark; SWE-PRBench and RAP are secondary.

**✅ DECISION 3 — RESOLVED (Qodo 100 / SWE-PRBench 25 / RAP 15; power below).**
- **Qodo = 100 PRs** (the full public set — the roadmap's C6). It carries the
  primary confirmatory test (H2).
- **SWE-PRBench = 25 PRs**, secondary; we acknowledge it is underpowered for a
  confirmatory test on its own and report it as agreement evidence, not a primary
  claim.
- **RAP = 15 PRs**, descriptive only (operational metrics; no correctness claims).

**Power justification (primary test, H2).** The primary test is a paired
comparison of per-PR recall (hierarchical vs generalists-3) over N = 100 PRs
(§5.2, paired Wilcoxon / mixed-effects). At α = 0.05 (two-sided) and 80% power, a
paired test on N = 100 detects a standardized effect of dz ≈ 0.28. Taking a
per-PR recall SD ≈ 0.25 (to be replaced with the pilot's measured value — see
below), that corresponds to a **detectable mean recall difference of ≈ 6–8
percentage points**. This floor is deliberately aligned with the study's
practical-significance threshold: a recall gain smaller than ~6 points would not
justify the added compute of specialization, so the experiment is powered to
detect exactly the effects that would matter. **This statement is provisional**
until the ≤5-PR pilot (§3.1) yields the observed per-PR recall variance; the
power paragraph will be finalized with that value **before** the freeze/OSF
submission.

### 3.3 Repeated runs & stopping rule
Each (PR × arm) is executed **3 times**. Deterministic arms (agentless,
agentless-large, hierarchical, consensus) run at temperature 0; `generalists-3`
runs at `sampleTemperature` (frozen value, default 0.7 — §4.2). Final per-instance metric
= arithmetic mean across runs; min/max/SD reported. No data-dependent stopping:
the full grid is run once (plus documented retries for transient infrastructure
failures only).

---

## 4. Variables

### 4.1 Measured (dependent) variables
- **Correctness (Qodo):** precision, recall, F1, `uniquePrecision`
  (dedup-normalized), localizationAccuracy, `snippetLocalizationAccuracy`,
  true/false positives, false negatives.
- **Human agreement (SWE-PRBench):** review coverage, agreement rate, review
  precision (interpreted as agreement, not objective correctness).
- **Cost/efficiency:** inputTokens, outputTokens, estimatedCostUsd, `latencyMs`
  (sum-of-calls), `criticalPathLatencyMs`, llmCalls, messageCount,
  `truncatedCallCount`.
- **Quality/behavior:** finding count, severity distribution, confidence,
  evidence score; consensus-only: agreementRate, self-vote vs peer-vote accept
  rates.

### 4.2 Controlled (held constant across arms)
Foundation model, prompt version, `sampleTemperature` (generalists-3),
temperature 0 (other arms), top-p, maxTokens, PR snapshot, validation engine,
matcher, evaluation scripts, JSON schema, severity/category definitions, AWS
region, dedup predicate, export schema. All frozen at the prompt-freeze
milestone (`prompt-freeze-v1` git tag).

---

## 5. Analysis plan

### 5.1 Matching (produced finding ↔ ground-truth issue)
Primary matcher: file match AND (line overlap OR snippet-anchored line match).
Results are reported under **both** a strict location-only matcher and a
semantic/LLM-judge matcher, and we state whether arm rankings are stable across
the two.

**✅ DECISION 4 — RESOLVED (A2 LLM-judge implemented as primary matcher).**
The semantic matcher is implemented and merged (roadmap A2, PR #24): an LLM judge
backed by a **Bedrock non-Anthropic model** (a different family than the Claude systems under
test), applied as `matched = file AND (line overlap OR judge score ≥ τ)`. Strict
location matching is reported alongside as a robustness check (dual-matcher
stability). Judge scores are precomputed once and persisted (replayable at zero
further cost).

Calibration (validated at pilot time, before the frozen campaign), the
no-human-labeling "three-pack":
1. **Silver-label accuracy** — the judge's accuracy on automatically-labeled easy
   cases (strict-overlap pairs = necessary positives; different-file pairs =
   necessary negatives).
2. **Inter-judge agreement** — a second Bedrock non-Anthropic model on the
   calibration set; report Cohen's κ between judges.
3. **Dual-matcher stability** — whether arm rankings hold under strict vs.
   semantic matching.
τ is calibrated on the pilot data. An optional ~50-pair human-labeled κ check
may upgrade the evidence but is not required.

### 5.2 Statistical models
- Unit of analysis: the PR (paired across arms). Primary test uses a
  **mixed-effects model** with PR as a random effect (findings cluster within
  PRs and PR difficulty varies), or a **paired Wilcoxon signed-rank** test on
  per-PR metrics as a non-parametric fallback.
- Report **both macro** (per-PR mean, each PR weighted equally) **and micro**
  (pooled over all findings) aggregations; if they diverge, both are reported and
  discussed.
- Effect sizes: **Cliff's δ** (paired). Report means, SD, and 95% CIs.
- **Multiple-comparison correction** (Holm–Bonferroni) across the family of
  pairwise ladder comparisons and metrics.

### 5.3 Inference criteria
Confirmatory hypotheses tested at α = 0.05 after correction. RQ4/H5 (cost-quality
trade-off) reported descriptively via a **quality-per-dollar Pareto frontier**;
no null-hypothesis test.

### 5.4 Exclusions
A (PR × arm × run) is excluded only if the pipeline fails after 3 retries
(infrastructure error, not a model output). Exclusions are logged in the campaign
manifest; the same PRs are analyzed across arms (list-wise: if any arm fails all
retries on a PR, that PR is dropped from the paired analysis and reported).

---

## 6. Threats to validity (registered)
- **Temperature deviation:** `generalists-3` runs at temperature > 0 while other
  arms run at 0 — intrinsic to self-consistency; reported, not hidden.
- **Training-data contamination:** Qodo PRs come from public repos likely in the
  model's training data (injected defects mitigate). Report model cutoff vs
  dataset release; optionally stratify by repo popularity.
- **Matcher validity:** see DECISION 4; κ vs human labels reported.
- **SWE-PRBench incompleteness:** human comments are not exhaustive ground truth;
  "beyond-human" findings are reported separately, not counted as false
  positives.
- **RAP self-preference:** RAP PRs are largely Claude-authored and the reviewer
  is Claude; case-study claims scoped accordingly (no correctness claims).
- **Construct — critical-path latency:** `generalists-3`/consensus exclude
  sub-millisecond merge time that hierarchical includes; compare arms on
  LLM-bound metrics, not merge overhead.

---

## 7. Freeze & reproducibility
Before the confirmatory campaign: tag `prompt-freeze-v1`; freeze prompts, model
id, temperatures, maxTokens, datasets/subset, dedup predicate, matcher, metrics,
export schema (runbook §22.1, generation-side). Evaluation-side changes remain
permitted post-hoc **only** because all raw LLM outputs are persisted (B1) and
the deterministic downstream is replayable (`npm run verify:replay`); every such
change is logged. Each experiment records commit hash, platform/prompt/model
versions, region, and config for full reproduction.
