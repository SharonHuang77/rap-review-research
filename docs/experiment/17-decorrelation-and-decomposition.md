# 17 — Decorrelation is the multi-agent lever: module, ladder, type-specialist, temperature, and conditioning arms

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
| Conditioned-sequential ("find-new" passes) | **+6pp recall, exceeds even cross-family** | strongest COVERAGE but precision collapses; a cross-family filter reclaims precision yet is strictly dominated by plain sampling + the same filter (§7.1) |

The only structure that beats spending the same compute on temperature-sampling a
single model is **cross-family** (decorrelated errors from different pretraining) —
and only by ~3pp, saturating after ~3 families. Two further knobs (§6–7):
generation **temperature** helps coverage only up to ~0.3–0.7 (it saturates fast
and degenerates entirely by 1.3), and downstream agreement **filters** trade recall
for precision (they never raise F1); **conditioning** each pass on prior findings
pushes recall highest of all (67%) but at a large precision cost. The tempting
"conditioning + cross-family filter" pairing is **falsified** (§7.1): the filter does
reclaim precision, but plain temperature sampling + the same filter strictly
dominates it (R30/P62 vs R24/P59), and neither beats the plain independent K=3 union.
No recombination of one model's own samples clears the plain-union frontier — only
cross-family (mechanism-changing) decorrelation does.

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
- On the coverage front-end (§6–7): generation temperature is optimal at ~0.3–0.7
  and degenerates by 1.3; downstream agreement filters buy precision only (never
  F1); conditioned-sequential generation is the highest-recall single-model method
  (67%) but F1-negative raw. The tempting **conditioning + cross-family filter**
  pipeline is now tested and **falsified** (§7.1): the filter reclaims precision but
  plain temperature sampling + the same filter strictly dominates conditioning
  (R30/P62 vs R24/P59), and neither clears the plain independent-union frontier. The
  report can state plainly that *no* recombination of one model's own samples beats
  plain union — closing the coverage-front-end question, not leaving it open.

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

## 6. Generation temperature and downstream filters

`temp-filter-analysis.ts`, K=3 Haiku per T, 99 Qodo PRs. Three pipelines per
generation temperature: raw union, self-consistency (keep findings recurring in
≥2 of 3 runs), cross-family corroboration (keep union findings a second family
also produces). Recall / precision / F1:

| T | raw union | self-consistency ≥2/3 | cross-family corrob. |
|---|---|---|---|
| 0.0 | R51 P50 **F1 .51** | R50 P53 F1 .52 | R13 P84 F1 .22 |
| 0.3 | R61 P50 **F1 .55** | R31 P65 F1 .42 | R17 P76 F1 .28 |
| 0.7 | R61 P50 **F1 .55** | R25 P71 F1 .37 | R18 P77 F1 .29 |
| 1.0 | R63 P50 **F1 .56** | R18 P76 F1 .30 | R16 P81 F1 .27 |
| 1.3 | **degenerate** — 0/300 runs valid (all JSON garbage) | — | — |

- **Optimal generation T ≈ 0.3–0.7.** Raw-union coverage saturates by T=0.3
  (51→61), gains only ~2pp more to T=1.0, and collapses at T=1.3 (past the
  coherence cliff — every run un-parseable). The recall ceiling is capability-bound
  (~61%, the single-model reachable set), not temperature-bound.
- **Filters are precision instruments, not F1 maximizers** — high precision, low
  recall, never beating raw union F1 (raw .55 > self-consistency .52 > cross-family
  .29). This independently reproduces the paper's framing: cross-family agreement
  buys precision (76–84%) at a recall cost, and is not a coverage tool.
- **"Push T higher, let the filter reclaim precision" is FALSIFIED for
  self-consistency**: higher T destroys the run-to-run overlap the recurrence filter
  needs, so its recall crashes (50→18%) — worse, not better, at high T. This
  strengthens the doc-04 H-verify null (self-consistency does not rescue at ANY
  temperature). It is only WEAKLY true for the cross-family filter: raising T from 0
  to 0.7 lifts corroborated recall 13→18% at ~flat high precision.

## 7. Conditioned-sequential ("find-new") — the strongest coverage lever, F1-negative raw

Idea (user): on a re-run, put a summary of the previous passes' findings in context
and instruct the model to find DIFFERENT issues (explicit diversity /
sampling-without-replacement, vs temperature's implicit diversity).
`ConditionedPromptBuilder` + `conditioned-eval.ts`: K=3 sequential passes/PR, T=0.7,
100 PRs, cumulative union after each pass vs the INDEPENDENT homo ladder at the same T.

| K | independent (homo T0.7) | conditioned recall | conditioned precision | F1 | findings/PR |
|---|---|---|---|---|---|
| 1 | 49% | 50% | 53% | 0.49 | 5.4 |
| 2 | 58% | **62%** | 32% | 0.39 | 11.2 |
| 3 | 61% | **67%** | 23% | 0.33 | 16.6 |

- **Efficiency: yes.** Conditioning reaches 62% by K=2 (independent needs K=3 for 61%).
- **Ceiling: EXCEEDED** — conditioned K=3 recall **67%** beats independent sampling
  (61%) AND cross-family union (64%, §2). The "find-new" pressure surfaces
  low-salience real issues the model will not volunteer in an independent pass, so a
  single model's reachable set is larger than independent temperature sampling
  touches. (This corrects the a-priori "cannot exceed the single-model ceiling"
  prediction.)
- **Precision: collapses.** 53→32→**23%**; F1 falls monotonically (0.49→0.33). The
  same "find-new" pressure fabricates (16.6 findings/PR). Raw, conditioning is
  F1-negative — worse than one pass.

**Conclusion:** conditioning is a **coverage front-end** (highest recall of any
single-model method), not a usable reviewer on its own. It only pays if a
downstream precision filter can recover precision *without* discarding the extra
coverage — exactly the high-coverage-generation + cross-family-agreement pairing
§6 motivates. §7.1 tests that pairing directly.

### 7.1 Conditioned base × cross-family filter — the filter reclaims precision but conditioning is strictly dominated

`conditioned-filter-analysis.ts` (zero-LLM re-analysis; reuses the conditioned union
findings + judge cache): for each conditioned finding, count how many of six OTHER
families (Kimi, GLM, DeepSeek, Nova, Llama4, Palmyra — never Haiku, the base's own
family) structurally corroborate it, then keep findings with ≥ *m* corroborators.
Every kept finding is a subset of the conditioned union, so its judge score is
already cached. **Matched control:** the identical filter (same pool, same
union-based corroboration, same 97 PRs) is applied to an INDEPENDENT Haiku K=3 union
(`ladder-haiku07`) — so the two bases differ *only* in how coverage was obtained
(explicit "find-new" conditioning vs implicit temperature diversity).

| base | filter | R | P | F1 | findings/PR |
|---|---|---|---|---|---|
| conditioned (find-new) | raw union | 66% | 23% | 0.33 | 16.5 |
| conditioned | × cross-family ≥1 (of 6) | 24% | 59% | 0.31 | 1.9 |
| conditioned | × cross-family ≥2 | 9% | 31% | 0.13 | 0.5 |
| conditioned | × Kimi+GLM ≥1 | 22% | 60% | 0.30 | 1.7 |
| **independent (temp K=3)** | raw union | 64% | 28% | 0.37 | 13.5 |
| **independent** | **× cross-family ≥1 (of 6)** | **30%** | **62%** | **0.37** | 2.3 |
| independent | × cross-family ≥2 | 11% | 35% | 0.15 | 0.6 |
| independent | × Kimi+GLM ≥1 | 29% | 62% | 0.36 | 2.2 |

- **The filter DOES reclaim precision on the 67% base** — 23% → 59–60% (≥1). So the
  literal §7 question ("can a filter recover the precision conditioning collapsed?")
  is **yes**. But it is F1-*negative*: filtering the conditioned base drops F1
  0.33 → 0.31 (recall craters 66% → 24%), so there is no usable operating point.
- **Matched control is decisive: conditioning is strictly dominated.** Under the
  *identical* filter on the *same* PRs, the plain independent-temperature base beats
  conditioning on **every** axis — recall 30% vs 24% (**Δ −6pp**), precision 62% vs
  59%, F1 0.37 vs 0.31. The extra coverage conditioning bought over independent
  sampling (66% vs 64% raw) is worse than fragile: it is *net-negative* after a
  corroboration filter. Rare-to-Haiku ⇒ rare-to-everyone, so the filter discards
  exactly what "find-new" added, and conditioning's fabrications (16.5 f/PR) pollute
  the filter's input enough to shave the survivors' precision too.
- **The filter never improves F1 over the raw union it filters** — for the clean
  independent base it is F1-*neutral* (0.37 → 0.37, sliding along an iso-F1 frontier
  from R64/P28 to R30/P62); for the conditioned base it is F1-negative. Requiring
  cross-family agreement is a **precision instrument**, not an F1 lever — reinforcing
  the registered H-verify null and the paper's cross-family = precision framing.

**Conclusion (closes §7):** the "coverage front-end + precision back-end" pipeline,
instantiated with the paper's own cross-family-agreement filter, does **not** rescue
conditioning. Plain independent temperature sampling + the same filter is strictly
better, and *neither* beats the no-frills independent K=3 union (R64/P28/F1 0.37).
No recombination of a *single model's* samples (temperature §6, conditioning §7) — with
or without a downstream filter — moves past the plain-union frontier. Only
mechanism-changing decorrelation (cross-family §2, and by extension lint/execution/
fine-tune) shifts it. This is the whole-document thesis, now closed on both ends.
