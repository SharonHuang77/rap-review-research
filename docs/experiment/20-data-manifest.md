# doc-20 — Data manifest: every number → S3 artifact → replay script

All run artifacts (raw model outputs, judge caches, harness logs) live in the
access-controlled S3 bucket — **not** in this repo (embargo convention; see the
paper's Threats section). Every reported number replays from these artifacts
with **zero new LLM calls**. AWS access to account `106189426706` required
(`aws sso login`, any profile with S3 read).

```
s3://rap-review-research-data-106189426706/
├── confirmatory/            # registered campaign (doc-12)
│   ├── phase2-results/      # 99 Qodo + 50 SWE-PRBench × 4 arms × 3 runs (~92 MB)
│   └── hetero-confirmatory/ # Kimi/GLM companions + pair-judge caches (~67 MB)
└── exploratory/             # docs 13-19 arms
    ├── capability-arm/      # doc-14: Sonnet-vs-Haiku DiD (~4 MB)
    ├── grounding-pilot/     # doc-13/16: grounded-review pilot + probes (~5 MB)
    ├── crab-arm/            # doc-16/18: CRAB structural + agentic runs (~5 MB)
    ├── module-arm/          # doc-17: module/ladder/specialist/temp/conditioned/
    │                        #   ceiling/lint arms (~28 MB)
    ├── data/crab-stage4.jsonl  # c-CRAB benchmark import (12 MB)
    ├── swe-run/             # doc-19: SWE-bench no-op preds + FAIL_TO_PASS
    │                        #   tracebacks + reviewer meta (~1 MB)
    ├── sonnet-arm/          # registered Sonnet 4.5 robustness arm, 99 Qodo PRs
    │                        #   x 4 arms x 3 runs (~29 MB). Chunked runs/caches
    │                        #   plus qodo-all-* (n=100, includes the legacy
    │                        #   swe-1 fold-in) and qodo99-runs.json (the Qodo-only
    │                        #   set the paper reports).
    └── ceiling-crab/        # ceiling generalization: 6 families x 50 c-CRAB PRs
                             #   diff-only + Haiku anchor subset (~2 MB)
```

## Download

```bash
B=s3://rap-review-research-data-106189426706
aws s3 sync $B/confirmatory/phase2-results/       phase2-results/
aws s3 sync $B/confirmatory/hetero-confirmatory/  hetero-confirmatory/
aws s3 sync $B/exploratory/capability-arm/        capability-arm/
aws s3 sync $B/exploratory/grounding-pilot/       grounding-pilot/
aws s3 sync $B/exploratory/crab-arm/              crab-arm/
aws s3 sync $B/exploratory/module-arm/            module-arm/
aws s3 cp   $B/exploratory/data/crab-stage4.jsonl data/benchmark/crab-stage4.jsonl
aws s3 sync $B/exploratory/swe-run/               swe-run/   # any local path; scripts take SWE_RUN env
aws s3 sync $B/exploratory/sonnet-arm/            sonnet-arm/
aws s3 sync $B/exploratory/ceiling-crab/          ceiling-crab/
```

## Number → doc → replay script

| Paper (week13) claim | Experiment doc | Data dir | Replay (zero LLM) |
|---|---|---|---|
| Table II per-arm P/R/F1; specialization null; H-verify | doc-12 | `phase2-results/` | `scripts/phase3-stats.ts` (see doc-12 §replay) |
| Hetero precision 0.716/0.575; 89% vs 54%; κ=0.952 | doc-12 | `hetero-confirmatory/` | `scripts/phase3-hetero-stats.ts` |
| TOST equivalence ±6-pt; MDE 3.8 pts; AC1/PABAK | PR #41 | `phase2-results/` + `hetero-confirmatory/` | `scripts/phase3-equivalence.ts`, `scripts/phase3-judge-agreement.ts` |
| Capability DiD −1.8 (null) | doc-14 | `capability-arm/` | `scripts/capability-analysis.ts`, `capability-stratify.ts` |
| Passive grounding 0.37→0.35 (n.s.) | doc-16 | `grounding-pilot/`, `crab-arm/` | `scripts/grounding-analysis.ts`, `crab-structural-eval.ts` |
| Ladder table (homo/hetero K=1..7) | doc-17 §6-7 | `module-arm/` | `scripts/compute-ladder.ts`, `temp-filter-analysis.ts` |
| Conditioned × filter | doc-17 §7.1 | `module-arm/` | `scripts/conditioned-eval.ts`, `conditioned-filter-analysis.ts` |
| 0.83 ceiling + leave-one-out + residue anatomy | doc-17 §8/10 | `module-arm/` | `scripts/oracle-complementarity.ts` |
| Aspect-verifier back-end ≤ plain union | doc-17 §9 | `module-arm/` | `scripts/aspect-verifier-eval.ts` |
| Linter 0.54 vs 0.46; hybrid 0.61 | doc-17 §11 | `module-arm/` | `scripts/lint-baseline.ts`, `lint-hybrid-ceiling.ts` |
| Module decomp +6.4 / matched-budget n.s. | doc-17 §1-5 | `module-arm/` | `scripts/module-agent-eval.ts`, `module-agent-analysis.ts` |
| Agentic precision 0.17 vs 0.13 (N=158) | doc-18 | `crab-arm/` + `crab-stage4.jsonl` | `scripts/crab-agentic-eval.ts`, `crab-analysis.ts` |
| Light repro ~15% reachable (n=20) | doc-19 §1-4 | `module-arm/` (findings) | `scripts/exec-repro-poc.ts` |
| Reviewer-on-top 1/6→5/6; goldInTb 25%→100% | doc-19 §6 | `swe-run/` | `scripts/swe_runtime_data.py` → `scripts/swe-reviewer-eval.ts` (`RUN_ID=revrt META_FILE=reviewer_meta_rt.json`; flask batch: `revnoop`/`reviewer_meta.json`) |
| Sonnet robustness arm: F1 0.546 vs 0.388–0.425; H2 0.636 vs 0.672 (p=0.012) | paper §IV-A | `sonnet-arm/` | `RUNS_IN=sonnet-arm/qodo99-runs.json CACHE_IN=sonnet-arm/qodo-all-cache.json PHASE2_OUT_DIR=sonnet-arm node scripts/phase3-stats.ts` |
| c-CRAB ceiling 0.36→0.55, plateau by ~3 families | paper §IV-E | `ceiling-crab/` | `HAIKU_RUNS=ceiling-crab/haiku-runs.json HAIKU_CACHE=ceiling-crab/haiku-cache.json FAMILIES="Kimi:…/kimi-runs.json:…/kimi-cache.json,GLM:…,DeepSeek:…,Llama4:…,Nova:…,Palmyra:…" node scripts/compute-ladder.ts` (saved output: `ceiling-crab/crab-ladder-result.txt`) |

Notes: the doc-19 §6 *eval* arms call Bedrock live (2 calls/instance) — the
harvested tracebacks in `swe-run/` are the fixed inputs, and the printed
transcripts in doc-19 record the outputs we report. Everything else above is a
pure cache replay. The SWE-bench harness runs themselves (doc-19 §5) need Docker
and are documented step-by-step in doc-19, including the four Windows fixes.
