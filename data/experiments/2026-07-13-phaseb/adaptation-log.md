# Phase B(i) — format-porting adaptation log (doc 09)

Discipline (FormatSpread, arXiv:2310.11324): **format-only** changes.
Semantic review content must stay sentence-identical to `v1`; only
output-format scaffolding may differ. Equal budget per family: ≤3 iterations
× 5 dev PRs × 2 runs. Dev set is disjoint from the 21-PR evaluation batch
(auto-selected by `phaseb-adapt-eval.ts`: first 5 non-eval Qodo instances).
After the final iteration the winning `promptVersion` is FROZEN; only then
may Phase C touch the evaluation batch.

Baseline being ported: `templates/v1/` (frozen Haiku prompt,
`prompt-freeze-v1`). Common template (`review-instructions.md`) is
byte-identical in all variants — every change is isolated to
`agentless/system.md`.

---

## Iteration 1 — initial variants (2026-07-13)

### v1-deepseek (target: DeepSeek V3.2)
Observed failure under v1 (doc 08): terse output, 2.9 findings/run vs
Haiku's 4.5; DeepSeek's known format behaviors: markdown-fence wrapping and
pre-JSON commentary.
Format changes (system.md only):
1. Added an `OUTPUT FORMAT` block: response must start with `{` / end with
   `}`; no markdown fences; no analysis before or after the JSON.
2. Added an exact-enum reminder for `riskLevel`/`severity` (lowercase, one
   word).
Semantic sentences: unchanged (verified line-by-line against v1).

### v1-llama (target: Llama 3.3 70B)
Observed failure under v1 (doc 08): 1.7 findings/run, one JSON-parse run
failure; Llama's known format behaviors: conversational preamble ("Here is
the review:") and weaker adherence to schemas stated only at the top.
Format changes (system.md only):
1. Explicit no-preamble / no-postscript instruction; response starts with `{`.
2. Schema restated in compact single-line form at the END of the system
   prompt (tail-position reminder).
Semantic sentences: unchanged.

Results (2026-07-13, 5 dev PRs × 2 runs each):

| label | completed | zero-finding | findings/run | strict P/R/F1 |
|---|---|---|---|---|
| deepseek.v3.2@v1 (baseline) | 10/10 | 2/10 | 3.2 | 0.39 / 0.23 / 0.27 |
| deepseek.v3.2@v1-deepseek | 10/10 | 3/10 | 2.8 | 0.39 / 0.24 / 0.28 |
| llama3.3@v1 (baseline) | 10/10 | 7/10 | 0.5 | 0.00 / 0.00 / 0.00 |
| llama3.3@v1-llama | 10/10 | 6/10 | 0.8 | 0.00 / 0.00 / 0.00 |
| haiku@v1 (reference) | 10/10 | 0/10 | 5.3 | 0.61 / 0.49 / 0.53 |

**Raw-response audit (removes the silent-drop concern):** a direct probe of
a zero-finding Llama run (aspnetcore-pr-8, v1-llama) returned syntactically
perfect JSON — `"findings": []`, a "looks correct" summary, clean
`end_turn`. The zero-finding runs are genuine substantive verdicts on PRs
whose golden sets are non-empty (seeded defects waved through), not
malformed output dropped by lenient validation.

**Decision after iteration 1: Phase B(i) CLOSES — no iteration 2.**
Zero format failures were observed (20/20 non-Haiku runs completed, valid
JSON confirmed by raw probe), so by the pre-registered rule below there is
nothing an iteration 2 may legitimately change. Format-only porting moved
nothing (DeepSeek F1 0.27→0.28, findings/run down; Llama 0.00→0.00):
**the cross-model transfer failure is substantive (defect-detection
capability under this semantic prompt), not format.** The FormatSpread-based
mechanism-1 hypothesis is refuted for this transfer; the Self-MoA parity
gate cannot be cleared by format adaptation, so Phase C generation is not
justified and the doc-09 heterogeneity question closes for this model trio.

---

## Iteration 2 — (only if iteration-1 signals show remaining FORMAT failures)

_Rule: a change here must answer a specific observed format failure from
iteration 1 (e.g. fences still appearing, truncated JSON), not a quality
gap. Quality gaps under correct formatting are a RESULT (format-only porting
insufficient), not something to patch with behavioral instructions._

**Not triggered** — no format failures observed in iteration 1. Closed.
