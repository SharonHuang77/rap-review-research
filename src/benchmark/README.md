# Benchmark Dataset & Ground-Truth Evaluation (RFC-13)

Evaluates the three review architectures — **Agentless, Hierarchical, Consensus**
— against external PR-review datasets that carry **ground truth**, so their
findings can be scored with precision / recall / F1 / localization accuracy
rather than heuristics alone.

> Plan: `docs/implementaion/13-benchmark-dataset-evaluation-plan.md`

```
raw dataset → Adapter → BenchmarkDataset
            → BenchmarkImporter → PR snapshots
            → BenchmarkRunner (Agentless + Hierarchical + Consensus) → BenchmarkRun[]
            → GroundTruthEvaluator → BenchmarkResult[]
            → BenchmarkCsvExporter → CSV
```

**Deterministic and LLM-free.** The evaluator, matcher, adapters, and exporter
perform no I/O and never call an LLM. Semantic title/description matching is a
**placeholder** (`NoopSemanticMatcher`) — the extension point exists but does not
call any model yet. The runner drives the *existing* Experiment pipeline, so the
only model calls come from whatever provider that pipeline is configured with
(a MockProvider in the demo/tests — no Bedrock).

## Files

```
src/benchmark/
├── models/
│   ├── ground-truth-issue.ts     # GroundTruthIssue (file + line span, optional category/severity)
│   ├── benchmark-instance.ts     # BenchmarkInstance (rawDiff + groundTruth)
│   ├── benchmark-dataset.ts      # BenchmarkDataset + BenchmarkSource
│   ├── benchmark-run.ts          # BenchmarkRun (one architecture × one instance)
│   └── benchmark-result.ts       # BenchmarkResult + BenchmarkArchitectureSummary
├── adapters/
│   ├── dataset-adapter.ts        # IBenchmarkDatasetAdapter<TRaw>
│   ├── qodo-pr-review-bench-adapter.ts
│   ├── swe-prbench-adapter.ts
│   └── normalize-severity.ts
├── matching/
│   ├── issue-matcher.ts          # IssueMatcher + MatchResult (file/line/category/severity)
│   └── semantic-matcher.ts       # ISemanticMatcher + NoopSemanticMatcher (placeholder)
├── ground-truth-evaluator.ts     # GroundTruthEvaluator (precision/recall/F1/localization)
├── benchmark-evaluator.ts        # BenchmarkEvaluator (batch + macro summary)
├── benchmark-importer.ts         # BenchmarkImporter (instances → snapshots, via RFC-02)
├── benchmark-runner.ts           # BenchmarkRunner (all three architectures per instance)
├── export/
│   ├── benchmark-export-row.ts   # BenchmarkExportRow + BENCHMARK_STABLE_COLUMNS
│   └── benchmark-csv-exporter.ts # BenchmarkCsvExporter (RFC-4180-style)
└── benchmark-errors.ts
```

## Matching & metrics

An `IssueMatcher` decides whether a produced finding corresponds to a
ground-truth issue using deterministic rules:

- **exact file match** (paths normalized: trimmed, leading `./` dropped),
- **line-range overlap** (finding's line inside `[lineStart, lineEnd]`),
- **category / severity comparison** — computed only when *both* sides carry the
  attribute; optional gates (`requireCategoryMatch` / `requireSeverityMatch`),
- **semantic score** — always `undefined` today (placeholder).

`GroundTruthEvaluator` uses a **greedy one-to-one** assignment (a finding matches
at most one issue, and vice-versa), then computes:

- `truePositives` = issues matched (file + line); `falsePositives` = unmatched
  findings; `falseNegatives` = unmatched issues,
- `precision = TP / produced`, `recall = TP / groundTruth`, `f1 = 2PR/(P+R)`
  (each 0 when its denominator is 0),
- `localizationAccuracy = TP / detected`, where *detected* counts issues matched
  at the **file** level — i.e. of the issues whose file we found, the fraction we
  also pinned to the right line span.

## Preserving the comparison

`BenchmarkRunner` reviews **every** instance with all three architectures
(default), producing one `BenchmarkRun` per (instance, architecture). The export
keeps `instanceId` stable across architectures, so each benchmark instance is a
directly comparable row group (RFC-13 E4: architecture is the only independent
variable).

## Datasets & adapters

- **Qodo PR-Review-Bench** (`QodoPRReviewBenchAdapter`) — primary quantitative
  benchmark; rows carry labeled issues with file, line span, category, severity.
- **SWE-PRBench** (`SWEPRBenchAdapter`) — human-agreement benchmark; labels are
  review comments keyed by (file, line) with no severity/category.

> The exact upstream field names may differ from these adapters' assumed raw
> shapes (`QodoRawDataset` / `SWEPRBenchDataset`); adjust the adapter if the real
> schema differs. Adapters do no I/O — the caller loads the rows, which keeps
> large datasets out of the module and out of tests.

## Scripts (mock provider, no Bedrock)

```
npm run benchmark:import     # adapt + import the sample subset into snapshots
npm run benchmark:run        # run the subset through all three architectures
npm run benchmark:evaluate   # compute precision/recall/F1/localization + summary
npm run benchmark:export     # print the benchmark CSV
```

Sample fixtures live in `tests/fixtures/benchmark/`.

## Out of scope

Downloading full datasets, statistical significance testing, LLM-backed semantic
matching, and dashboard work are intentionally not included here.
