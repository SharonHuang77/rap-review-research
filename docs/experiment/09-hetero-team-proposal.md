# 09 — Heterogeneous teams, tested fairly (proposal)

**Status:** proposal + Phase A implemented. **Exploratory** — not part of the
registered confirmatory analysis (04-preregistration.md is unchanged).

## 1. Why revisit

Doc 08's heterogeneous-team experiment returned an *informative null*: the
3-family union (Haiku + DeepSeek + Llama) lifted recall to 0.65 with only
9.3 findings/run, but F1 did not beat the homogeneous teams. We identified two
instrument failures, which means the hypothesis was never fairly tested:

1. **Prompt–model transfer failure.** The frozen Haiku prompt was fed verbatim
   to DeepSeek/Llama. Sclar et al. (FormatSpread, arXiv:2310.11324, ICLR 2024)
   show *"format performance only weakly correlates between models"* — up to
   76 accuracy points of format-induced variance — and explicitly call
   single-format cross-model comparison an invalid design. Our null is the
   textbook case.
2. **Lexical cross-model matching (A4).** `areDuplicateFindings` merges
   paraphrases within one model's style, but different families word the same
   issue differently, so cross-model corroboration was systematically
   under-counted — deflating exactly the signal the experiment was measuring.

Both are fixable. Neither requires Haiku quota.

## 2. Hypothesis and the pre-specified gate

> **H-hetero.** Errors correlate less across model families than across
> re-samples of one family; therefore findings corroborated by ≥2 *families*
> have higher precision than findings corroborated by ≥2 *runs* of the same
> family, at comparable recall.

This is the generation-side mirror of the eval-side signal doc 08 already
validated (cross-architecture corroboration → 83% judged real by an
independent model). Support: ReConcile (arXiv:2309.13007, ACL 2024 —
diverse-LLM consensus beats single-model self-consistency on reasoning);
Mixture-of-Agents (arXiv:2406.04692 — layered heterogeneous aggregation);
panel-of-judges evidence that diversity de-biases (Verga et al.,
arXiv:2404.18796).

**The honest counter-prediction.** Self-MoA (Li et al., arXiv:2502.00674)
finds that mixing models often *loses* to self-ensembling the single best
model: the diversity dividend is eaten by quality dilution unless members are
near parity. This converts into a pre-specified **entry gate**:

> A family enters the heterogeneous pool only if its solo semantic F1 (with
> its *adapted* prompt, Phase B) is ≥ 0.85 × the best family's. If the gate
> fails, Self-MoA predicts the null reproduces — and either outcome is a
> result: two registered opposing predictions, one of which must lose.

## 3. Design: three phases, cheap → expensive

| Phase | What | New generation | Status |
|---|---|---|---|
| **A** | Re-cluster the persisted doc-08 runs with a **semantic cross-model matcher**; homo AND hetero re-clustered with the same instrument; lexical rows kept side-by-side to quantify the instrument effect | **zero** (pair-judge calls only) | implemented — `npm run hetero:recluster` |
| **B** | (i) **Format porting**: adapt the frozen prompt per family — semantic content unchanged, format/scaffold adapted; 5 dev PRs × ≤3 iterations per family, equal budget, adaptation log committed, then frozen. (ii) **Matcher validation**: two annotators label ~50 candidate pairs, report Cohen's κ and judge–human agreement | 5 dev PRs × 2 families | proposed |
| **C** | Regenerate DeepSeek/Llama on the 21-PR batch with adapted prompts (3 runs each); compare homo-V1 vs hetero-V1 under the Phase-A matcher; primary metric = precision of ≥2-family vs ≥2-run corroborated findings | 21 × 2 families × 3 | proposed |

Prompt-adaptation method: manual format porting first (cheap, auditable);
DSPy/MIPROv2 compilation (arXiv:2310.03714; arXiv:2406.11695) as a
sensitivity analysis if Phase C is promising — with identical optimization
budgets per family, mirroring the compute-matched design ethos.

## 4. Fairness rules (what "fairly tested" means)

1. **Same instrument for every team.** Phase A re-clusters homo teams with the
   semantic matcher too; comparing semantic-hetero against lexical-homo would
   itself be a confound.
2. **Non-circular judging, extended.** The team is Claude+DeepSeek+Llama and
   the finding→golden judge is Llama; the pair judge is therefore a **fourth
   family** (Amazon Nova Pro by default). If a fallback judge shares a family
   with a member, that overlap is recorded as a threat (Panickssery et al.,
   arXiv:2404.13076). Pairwise same-issue judging follows LLM-Blender's
   PairRanker insight that pairwise comparison resolves subtle cross-model
   differences (arXiv:2306.02561).
3. **Equal adaptation budget** per family, logs committed, prompts frozen
   before Phase C generation (double-freeze discipline, doc 07).
4. **Budgeted, resumable, replayable.** Pair scores are cached
   (`pair-judge-cache.json`); re-clustering at any threshold is free;
   `MAX_JUDGE_CALLS=0` gives a zero-cost offline dry run that also prices the
   full run (pending-pair count).

## 5. Phase A runbook

```bash
# offline dry run — no LLM calls; prints candidate/pending pair counts
MAX_JUDGE_CALLS=0 npm run hetero:recluster

# full run (needs Bedrock creds; Nova Pro enabled, or override the judge)
npm run hetero:recluster
# PAIR_JUDGE_MODEL=<modelId>  PAIR_THRESHOLD=0.7  SEMANTIC_THRESHOLD=0.7
```

Inputs are the persisted doc-08 artifacts in
`data/experiments/2026-07-12-hetero-team/` (see its README); outputs
(`pair-judge-cache.json`, `recluster-report.json`) land beside them. The
script reports, per team × instrument (lexical vs semantic):
V0 / V1 k=2 / V1 k=3 under strict and semantic golden matching; the Self-MoA
entry-gate table (solo F1 parity); pair-threshold sensitivity (τ ∈ {0.5, 0.7,
0.9}, free from cache); and the H-hetero diagnostic — golden-match rate by
corroboration depth, families vs runs.

**Reading Phase A.** Phase A can only *partially* rescue the null: it fixes
mechanism 2 (matching) but not mechanism 1 (prompts) — DeepSeek/Llama runs
remain prompt-unadapted, so their solo quality (and the gate) is a lower
bound. If semantic re-clustering already narrows the homo–hetero gap, that is
evidence mechanism 2 mattered and raises the expected value of Phase B/C; if
nothing moves, the prompt mechanism carries the whole null and Phase B is the
decisive test.

## 6. Threats

- **Pair matcher unvalidated until Phase B(ii).** Phase A results are
  instrument-relative; the 50-pair human check bounds judge error.
- **Rep-selection bias.** A cluster's representative is the first finding in
  member order (Haiku first for hetero teams), so localization credit can
  favor Haiku's line anchors. Deterministic and disclosed; sensitivity check
  (rotate rep order) is cheap if it matters.
- **Golden incompleteness (doc 08 §completeness).** Cross-family clusters not
  in golden may be real; precision-vs-golden penalizes hetero teams most. The
  completeness-corrected target should be reported alongside when Phase C
  runs.
- **Judge-family fallback.** If Nova is unavailable and the judge falls back
  to a member family, self-preference bias re-enters; record and report.

## 7. Papers (all verified against arXiv)

| role | paper |
|---|---|
| root cause of the null | Sclar et al., FormatSpread, arXiv:2310.11324 |
| prompt adaptation | Khattab et al., DSPy, arXiv:2310.03714; Opsahl-Ong et al., MIPROv2, arXiv:2406.11695 |
| cross-model pairwise comparison | Jiang et al., LLM-Blender, arXiv:2306.02561 |
| heterogeneous-consensus gains | Chen et al., ReConcile, arXiv:2309.13007; Wang et al., MoA, arXiv:2406.04692 |
| counter-prediction + entry gate | Li et al., Self-MoA, arXiv:2502.00674 |
| judge diversity / self-preference | Verga et al., arXiv:2404.18796; Panickssery et al., arXiv:2404.13076 |
