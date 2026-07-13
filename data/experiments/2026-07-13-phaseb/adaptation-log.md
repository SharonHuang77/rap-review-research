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

Results (to fill after `phaseb:dev` runs):

| label | completed | zero-finding | findings/run | strict P/R/F1 |
|---|---|---|---|---|
| deepseek.v3.2@v1 (baseline) | | | | |
| deepseek.v3.2@v1-deepseek | | | | |
| llama3.3@v1 (baseline) | | | | |
| llama3.3@v1-llama | | | | |
| haiku@v1 (reference) | | | | |

Decision after iteration 1: _pending_

---

## Iteration 2 — (only if iteration-1 signals show remaining FORMAT failures)

_Rule: a change here must answer a specific observed format failure from
iteration 1 (e.g. fences still appearing, truncated JSON), not a quality
gap. Quality gaps under correct formatting are a RESULT (format-only porting
insufficient), not something to patch with behavioral instructions._
