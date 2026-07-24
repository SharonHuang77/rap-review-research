# 17 — Decorrelation is the multi-agent lever: module, ladder, and type-specialist arms

**Status:** EXPLORATORY (Qodo injected-defect benchmark, Haiku 4.5 SUT unless noted;
cross-family adds Kimi/GLM/DeepSeek/Nova/Llama4/Palmyra). NOT the registered
confirmatory. All analysis replays from persisted runs + judge caches (zero LLM at
analysis time). Sibling of doc-16; both probe "which multi-agent structure actually
helps code review."
**Date:** 2026-07-24

## 0. TL;DR — one axis: error decorrelation

Union recall grows only in proportion to how DECORRELATED the K draws are.
Everything reduces to this axis, measured at equal call budget:

| Multi-agent structure | recall vs temp-matched sampling | verdict |
|---|---|---|
| Temperature-sampling one model (temp 0.7, K draws) | baseline — captures the bulk (+~12pp over 1 draw) | cheap, effective |
| **Cross-family union** | **+3pp, saturates at ~3–4 families** | real but small |
| One-agent-per-module | ≈ 0 (= the compute) | no independent value |
| Error-type-specialist prompts | **−3pp (worse than generalist)** | negative — prompt "personas" suppress, don't diversify |
| Static grounding / whole-file context (doc-16) | 0 | not a lever (needs agency) |
| Model capability / scale (doc-14) | broad, undirected (DiD null) | not a targeted lever |

The only structure that beats spending the same compute on temperature-sampling a
single model is **cross-family** (decorrelated errors from different pretraining) —
and only by ~3pp, saturating after ~3 families.

## 1. Module decomposition — no value beyond compute

Idea (user): one agent per code module, unioned. Partition each PR's diff by module
(first two path segments, `src/architectures/module-partition.ts`), review each
slice with its own agentless agent, union via the deterministic Synthesizer.

- **Phase 1 (50 PRs, vs whole-PR single):** module-union recall 51%→57%
  (**+6.4pp, p=0.016**), precision flat, findings/PR 5.5→7.6. Looks like a win —
  BUT module-union spends ~2.6× the calls (one per module) of the single reviewer.
- **Compute-matched control (24 multi-module-GT PRs, equal K calls):** vs whole-PR
  reviewed K times at temp 0.7 and unioned (`sample-union`): module-union
  **54% vs 57%, Δ=−2.9pp (n.s.)**, precision 46% vs 50%, findings/PR 9.8 vs 18.4.
  The sharp "boundary blindness" prediction (per-module agents miss cross-module
  defects) did not appear either — module split is just neutral-to-slightly-worse.

**Conclusion:** the +6.4pp was the extra COMPUTE, not the decomposition. At equal
calls, splitting the PR by module does not beat (slightly trails) plain
multi-sampling. Module structure is not an independent lever.
Scripts: `module-agent-eval.ts` (STRUCTURAL/SAMPLE_MATCH modes), `module-agent-analysis.ts`.

## 2. Decorrelation ladder — the compute effect IS decorrelation (with a correction)

`compute-ladder.ts`, 97 Qodo PRs, semantic τ=0.7. Two ladders, same K=1 anchor:

**HETERO** (add one model FAMILY per rung, 1 run each):

| K | +family | recall | Δ | precision |
|---|---|---|---|---|
| 1 | Haiku | 51% | — | 54% |
| 2 | +Kimi | 61% | +10.0 | 54% |
| 3 | +GLM | 64% | +3.0 | 55% |
| 4 | +DeepSeek | 65% | +1.1 | 54% |
| 5 | +Nova | 65% | +0.0 | 54% |
| 6 | +Llama4 | 66% | +0.8 | 52% |
| 7 | +Palmyra | 66% | +0.8 | 52% |

Diversity **saturates at ~3–4 families (~65%)**; the first cross-family member does
most (+10), the rest ≤3pp → ~0. Findings/PR keep rising (5→18) with flat recall and
slowly eroding precision — piling on families past ~4 only adds noise.

**HOMO** (same Haiku, temp 0.7, K samples): K1 49% → K2 58% → K3 **61%**.

**CORRECTION (why the temp-matched control mattered).** An earlier reading compared
cross-family against a temp-**0** homo ladder (3 near-identical runs → +0.9pp floor)
and reported a **+12.6pp** "diversity bonus." That baseline was unfair:
temperature-sampling the SAME model already reaches 61% at K=3. Against the fair
temp-0.7 homo, the **diversity bonus is only +3.0pp** (K2 and K3). The doc-14 §10.1
`single-vs-union` "+13pp cross-family" figure has the same temp-0-floor artifact and
should be read as ~+3pp over temperature-matched sampling.

**Conclusion:** the "compute effect" is a **decorrelation effect**; temperature
alone captures the bulk (~+12pp from 1→3 draws), and cross-family adds a real but
modest **+3pp** on top before saturating.

## 3. Error-type-specialist agents — negative

Idea (user): taxonomize error types, one agent per type. Qodo GT covers two types
(rule/convention, functional), so two type-specialist prompts (`report ONLY
convention issues` / `ONLY functional issues`, `TypeSpecialistPromptBuilder`),
unioned. `type-specialist-eval.ts` / `-analysis.ts`, 99 PRs.

- **Per-type recall (does focus rescue the blind spot?) — it HURTS:** on RULE-GT
  the generalist gets 32% but the convention-agent only **24%**; on FUNC-GT
  generalist 68% → functional-agent **59%**. The "report ONLY X" instruction makes
  each agent conservative (team 5.3 findings/PR vs generalist 16.1), so it misses
  even its OWN type. This confirms the recognition-ceiling reading (doc-13 audit
  probe): focus suppresses output, it does not raise recognition.
- **Team vs baselines (equal 2-call budget):** type-team **47%** R / 57% P
  < generalist single 50% / 53% < compute-matched samples 58% / 51%
  < cross-family 60% / 53%. The team's only edge is precision (fewer findings).

**Conclusion:** prompt-level type "personas" on one model are a **negative**
decorrelation source — narrowing/suppressing, not productively diversifying (≈ the
doc-04 H2 specialization null, sharper). Type specialization pays ONLY when it
changes the detection MECHANISM: a deterministic tool (doc-13 lint: async-suffix
43% vs LLM 7%), a different model family (§2), or genuine fine-tuning — not a prompt.

## 4. What this means for the paper

- Report cross-family verification as a **real but small (+3pp), fast-saturating**
  lever over temperature-matched single-model sampling — not the dominant effect the
  temp-0 comparisons suggested. This right-sizing (not inflation) is the point.
- Module decomposition and type-specialist prompting are **non-levers** (compute
  effect / negative). Combined with doc-16 (static context null) and doc-14
  (capability DiD null), the surviving positive multi-agent claim is narrow and
  honest: **decorrelated errors help a little; most structure does not.**
- Mechanism-changing specialization (lint/execution/family/fine-tune) is the place
  real gains live — future work.

## 5. Caveats

- Qodo injected defects (conventions + functional only); Haiku SUT (cross-family at
  temp 0; homo at temp 0.7). Family order affects per-step ladder marginals, not the
  K=max total. Type-specialist result is for strict "report ONLY X" prompts; a soft
  "pay attention to X" framing may differ but the direction matches H2.
- Recall vs the frozen semantic matcher (τ=0.7); precision is micro over produced
  findings. n≈97–99 PRs (module compute-matched control n=24, underpowered — CI wide
  but point estimate negative).
- All arms EXPLORATORY (data collected/inspected); a confirmatory decorrelation-
  saturation claim would pre-register on a disjoint PR set + new families.
