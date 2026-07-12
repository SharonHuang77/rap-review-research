# 08 — Verifier Strength as the Governing Variable (Exploratory Follow-Up)

**Status:** exploratory follow-up study — **NOT part of the registered confirmatory analysis** (`prompt-freeze-v1` / OSF). If pursued seriously, pre-register separately.

---

## Motivation
The registered ladder (agentless → generalists-3 → hierarchical → consensus) varied **generation topology** and found no benefit: agentless (single pass) won F1; extra agents bought recall but lost precision faster. Reinterpretation: **every multi-agent arm aggregated (merge/vote) but none rigorously *verified* findings.**

A contrasting data point — the reported GPT-5.6 "Cycle Double Cover" multi-agent proof (2026-07, *unverified*) — succeeds where its recipe pairs diverse parallel generation with **adversarial error-hunting agents**. The common thread with our own null result:

> **The F1 payoff of test-time compute is governed by VERIFIER STRENGTH, not agent count or topology.** Math scales with compute because verification is cheap and reliable; code review does not, because our arms had no verifier — added agents only added false positives.

## Hypotheses
- **H-A** A verifier-filtered best-of-N review achieves **F1 > agentless(1)** — keeping multi-sample recall while a verifier restores precision.
- **H-B** F1 rises with **verifier strength** (V0→V4) and is largely **insensitive to N** beyond a small N (generation compute saturates; verification compute pays).
- **H-C** The precision–recall operating curve of verifier-filtered best-of-N **dominates** the single-pass point.

## Architecture under test — Verifier-Filtered Best-of-N (VF-BoN)
1. Generate **N** diverse single-pass (agentless) reviews at temperature > 0.
2. Pool + dedup all findings (A4 dedup) → high-recall, low-precision candidate set.
3. Score each candidate finding with a verifier **V**.
4. Keep findings with score ≥ τ → the filtered review.
5. Evaluate P/R/F1 (strict + semantic/A2) vs. agentless(1) and vs. the consensus/hierarchical arms.

## Independent variable — the verifier ladder V (this is the study)
| level | verifier | needs new LLM calls? |
|---|---|---|
| **V0** | none (raw union of N) — recall ceiling / precision floor | no |
| **V1** | self-consistency: finding must recur in ≥ k of N samples (k is a knob) | no |
| **V2** | LLM-judge binary: "is this a real, correct issue in this diff?" | yes (1/finding) |
| **V3** | LLM-as-a-Verifier: continuous score via repeated eval (K) + criteria decomposition (correctness / severity / location), threshold τ | yes (K×C/finding) |
| **V4** | **adversarial refuter** (transfer of the CDC "error-hunting agents"): an agent argues each finding is wrong/nitpick; keep only findings that survive refutation | yes |

## Why it's cheap and freeze-safe
- **Generation side reuses frozen data.** We already persist repeated-run generations (`judge-runs-*.json`); the **union of findings across those runs *is* the best-of-N candidate pool**. → V0/V1 need **zero new generation**.
- Only V2–V4 add **eval-side** verifier calls — replayable and cacheable exactly like the A2 judge cache (`CoverageScoreCache` / `SemanticScoreCache`).
- Eval-side only ⇒ does **not** touch the pre-registration's frozen generation. Runs mostly on existing artifacts, near-free.

## Metrics (reuse existing harness)
- `GroundTruthEvaluator`: strict (file+line) **and** semantic (A2 judge, τ) matching; macro + micro P/R/F1; dedup-normalized (A5).
- **New plots:** (a) F1 vs. verifier strength V0→V4; (b) precision–recall operating curve as τ sweeps, overlaid with the agentless(1) and consensus/hierarchical points; (c) F1 vs. N at fixed V (to test H-B's N-insensitivity).

## Success criterion
VF-BoN at some V beats agentless(1) on F1 under **both** matchers, and the gain tracks **V**, not **N**. That would convert the registered null ("more agents don't help") into a sharper, more useful claim: **"multi-agent helps only with a strong verifier; verifier strength is the governing variable."**

## Threads this unifies
rap-review-research null result · LLM-as-a-Verifier (V3) · the CDC adversarial-agent recipe (V4) · the "test-time compute is bounded by verifiability" thesis.

---

## First replay results (2026-07-12, `npm run bon:eval`, zero new LLM calls)

Data: `phase2-val-runs.json` — the clean Phase-2 validation batch (21 instances × 4 arms × 3 runs, Haiku, frozen prompts) + its persisted judge cache. Semantic = A2 judge, τ=0.7. Macro over instances.

| variant | findings/run | P(sem) | R(sem) | **F1(sem)** |
|---|---|---|---|---|
| agentless single mean | 4.5 | 0.55 | 0.51 | **0.49** |
| agentless V0 / k=2 / k=3 | 5.3 / 4.4 / 4.0 | ~0.53–0.55 | ~0.47–0.52 | 0.47–0.49 (flat) |
| generalists-3 single mean | 11.7 | 0.28 | 0.66 | 0.37 |
| generalists-3 **V0 union** | **29.1** | 0.14 | **0.76** | 0.23 |
| generalists-3 **V1 k=2** | 4.3 | **0.51** | 0.49 | **0.48** |
| hierarchical single / k=3 | 10.9 / 9.5 | 0.30 / 0.33 | 0.66 / 0.64 | 0.39 / 0.41 |
| consensus single mean | 9.2 | 0.34 | 0.63 | 0.41 |
| consensus **V1 k=3** | 6.6 | **0.46** | **0.57** | **0.48** |

**Readings.**
1. **Self-consistency (V1) rescues the multi-agent arms' precision**: generalists-3 0.37→**0.48** (+0.11), consensus 0.41→**0.48** (+0.07) — both now ≈ agentless (0.49). The multi-agent precision penalty is **not intrinsic**; a zero-cost verifier recovers it. The registered read "extra agents are net-negative" refines to "extra agents are net-neutral *once verified* — and net-negative unverified."
2. **consensus + V1 k=3 changes the operating point**: equal F1 to agentless but **+6pt recall** (0.57 vs 0.51) — the preferred arm when misses cost more than false alarms (C2 operating-curve framing).
3. **agentless is verifier-insensitive because its repeats are near-duplicates** (union 5.3 vs 4.5 findings): the frozen low-temperature repeats carry no harvestable diversity. Testing H-A properly for agentless needs diverse sampling (temperature > 0) = new generation.
4. **Headroom for stronger verifiers (V2/V3) is real**: the generalists-3 union hits **R 0.76** — the candidate pool contains far more true findings than V1's crude multiplicity filter keeps (R 0.49). A judge-based verifier that filters FPs *without* requiring recurrence targets that gap. This is the argument for funding the V2/V3 rungs.

**Limits:** exploratory replay; 21 instances (validation batch), macro noise; k-grid only {1,2,3}; single model (Haiku); NOT part of the registered confirmatory analysis.

## V2 results — DeepSeek V3.2 binary judge (2026-07-12, `VERIFIER_MODEL=deepseek.v3.2`)

Non-circular triangle: generation = Haiku (SUT), semantic-match judge = Llama, **verifier = DeepSeek V3.2** — no family judges its own output. DeepSeek judged 1,181 unique pooled findings: **981 real / 200 rejected (17% rejection).** F1(sem), key rows:

| variant | findings/run | P(sem) | R(sem) | **F1(sem)** |
|---|---|---|---|---|
| agentless single (baseline) | 4.5 | 0.55 | 0.51 | **0.49** |
| generalists-3 **V1 k=2** (free) | 4.3 | 0.51 | 0.49 | **0.48** |
| generalists-3 **V2** (DeepSeek) | 24.3 | 0.17 | 0.72 | 0.26 |
| consensus **V1 k=3** (free) | 6.6 | 0.46 | 0.57 | **0.48** |
| consensus **V2** (DeepSeek) | 10.0 | 0.30 | 0.59 | 0.36 |
| consensus **V1k2+V2** | 7.2 | 0.42 | 0.57 | 0.45 |

**V2 did NOT help — a single binary LLM judgment is a *weak* verifier here.**
1. **Too lenient:** rejected only 17%; the multi-agent arms' false positives mostly survived → precision barely moved (generalists-3 0.14→0.17 vs V1's 0.51). Cheap self-consistency filtered far better.
2. **It even removed true findings:** V1k2+V2 < V1k2 alone (generalists-3 0.48→0.43) — layering the judge on top of self-consistency *lost* recall without buying precision.
3. **This is exactly the LLM-as-a-Verifier premise:** naive binary judging is weak; strength needs continuous scores + repeated evaluation (K) + criteria decomposition (C). **V2's failure is the motivation for V3, not evidence against verifiers.**
4. **Metric confound (important):** precision is measured vs. the golden PR comments, which are **incomplete**. A validity-verifier that correctly *keeps* a real-but-unlisted finding still scores it as a false positive. V1 helps not because it judges validity but because **recurrence selects for salience**, which correlates with what humans flagged. So "precision-vs-golden" understates any content verifier; a pseudo-golden (union of arms) or a manually-adjudicated sample is needed to score V2/V3 fairly.

**Refined thesis:** verifier strength matters, but strength = **structure** (self-consistency; or continuous + K + C), **not** a strong model making one binary call. **H-A remains UNDEMONSTRATED:** the best multi-agent config (V1) *ties* agentless (~0.48–0.49), doesn't beat it. The one real multi-agent edge stays the **operating point** — consensus V1 k=3 holds +6pt recall (0.57 vs 0.51) at equal F1.

**Next rungs:** V3 = LLM-as-a-Verifier proper (continuous score + criteria decomposition + K), which the V2 null specifically motivates; a stricter/criteria-decomposed V2 prompt; and a fairer precision target (pseudo-golden or sampled human adjudication) to remove the golden-incompleteness confound. (Caveat: V2's leniency is partly prompt-sensitive — a single agreeable binary judgment; the structured V3 method is the principled fix.)

## Golden-completeness diagnostic (2026-07-12, `npm run golden:completeness`, FREE)

To separate "weak verifier" from "incomplete golden", cross-arm corroboration (a finding independently produced by ≥2 of the 4 distinct architectures) + the independent DeepSeek verdict are used as two "is-it-real" signals. Validation batch (21 instances):

- **golden lists 108 issues; 88 more clusters are corroborated by ≥2 independent architectures** (DeepSeek judges **83%** of those real; 94% of the ≥3-arch ones). → the plausibly-real issue set is ~196; **golden captures only ~55%.**
- **DeepSeek says "real" to ~82% of even SINGLE-arch findings**, barely rising with corroboration (82%→83%→94%). A good verifier's real-rate should climb steeply with corroboration; DeepSeek's near-flat 82% floor is independent confirmation that **V2 is genuinely too lenient** — it does not track the corroboration signal.

STRICT P/R/F1 vs golden → vs golden ∪ {≥2-arch corroborated}:

| arch | P | R | F1 |
|---|---|---|---|
| agentless | 0.48→**0.82** | 0.47→0.45 | 0.44→**0.55** |
| generalists-3 | 0.25→0.45 | 0.61→0.62 | 0.34→**0.49** |
| hierarchical | 0.26→0.51 | 0.59→0.63 | 0.35→**0.53** |
| consensus | 0.29→0.51 | 0.55→0.56 | 0.36→**0.50** |

**Both causes are real, now separated:**
1. **Golden is ~45% incomplete.** Precision-vs-golden systematically understates *every* arm, and penalizes the multi-agent arms most (they surface more real-but-unlisted findings). Against a completeness-corrected target the F1 gap collapses: agentless 0.44→0.55 vs multi-agent 0.34–0.36→**0.49–0.53**.
2. **V2 (DeepSeek binary) is independently confirmed weak** (flat 82% "real" floor).

**Revised bottom line.** Agentless still (narrowly) leads on F1 even after correcting the golden confound, so **H-A remains unmet** — but the multi-agent "precision collapse" was *substantially* a measurement artifact, not a real quality gap. The single most important methodological takeaway: **the registered study's strict-vs-golden precision understates all arms and disadvantages high-recall (multi-agent) arms; a completeness-corrected precision target is needed for any fair precision claim.** (This is a *threat-to-validity* note for the main study, not a change to the frozen pre-registration.)

**Bias caveat (honest):** the silver set is built from cross-arm agreement, so its absolute precisions are inflated (esp. agentless 0.82) and it is not a neutral oracle — it upper-bounds golden incompleteness. The defensible, less-circular numbers are the corroboration count (108 vs +88) and the DeepSeek cross-check (83% real), which agree that golden is materially incomplete.
