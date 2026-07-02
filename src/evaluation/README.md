# Research Evaluation Engine (RFC-07)

Turns completed experiments into standardized, reproducible research metrics —
the dataset used to compare review architectures. This is **research
methodology**, not execution infrastructure.

> Spec: `docs/implementaion/07-evaluation-engine.md`

```
StoredExperimentResult → EvaluationEngine → ExperimentMetrics
StoredExperimentResult[] → EvaluationEngine.evaluateBatch → ExperimentComparison[]
```

**Deterministic and pure**: no repositories, no databases, no LLM/Bedrock calls,
no `Date.now`/randomness. It operates only on supplied `StoredExperimentResult`
objects (from the Storage Engine) and never mutates them.

## Files

```
src/evaluation/
├── evaluation-engine.ts     # EvaluationEngine + IEvaluationEngine (orchestrator only)
├── finding-metrics.ts       # FindingMetricsCalculator (review quality)
├── cost-metrics.ts          # CostMetricsCalculator (operational cost, pass-through)
├── evidence-metrics.ts      # EvidenceMetricsCalculator (delegates to IEvidenceScorer)
├── comparison-engine.ts     # ComparisonEngine (group architectures by snapshot)
├── evaluation-errors.ts     # EvaluationError / MetricCalculationError / ComparisonError
├── models/
│   ├── experiment-metrics.ts     # ExperimentMetrics + ReviewQuality/OperationalCost/ResearchEvidence
│   ├── experiment-comparison.ts  # ExperimentComparison
│   └── evaluation-export-row.ts  # EvaluationExportRow + toEvaluationExportRow()
└── scorers/
    ├── evidence-scorer.ts         # IEvidenceScorer (pluggable strategy)
    └── heuristic-evidence-scorer.ts
```

## Metric categories

- **Review quality** (`FindingMetricsCalculator`): finding count, per-severity
  counts, average confidence, duplicate count (by `file+line+title`).
- **Operational cost** (`CostMetricsCalculator`): latency, tokens, cost, LLM
  calls, message count — copied through from the stored result unchanged.
- **Research evidence** (`IEvidenceScorer`): the evidence score.

## Evidence scoring (pluggable)

The final research Evidence Score needs signals that don't exist yet (reviewer
acceptance, architecture agreement, later-fix rate). So scoring is behind
`IEvidenceScorer`, and the engine depends **only** on that interface. RFC-07
ships `HeuristicEvidenceScorer`:

```
evidenceScore = 0.4·avgSeverity + 0.4·avgConfidence + 0.2·volumeSignal   (0 when no findings)
  severity: low .25 / medium .5 / high .75 / critical 1
  volumeSignal = min(findingCount / 5, 1)
```

Weights are documented constants (heuristic v1) — the score is derived from
signals, not hard-coded. A future `FinalEvidenceScorer` can replace it without
changing the engine.

## Comparison grouping

`evaluateBatch` evaluates each result (reusing `evaluate`) then `ComparisonEngine`
groups the metrics into `ExperimentComparison`s by **PR snapshot**. The snapshot
id is derived from the experiment id (which is the RFC-01 idempotency key
`snapshotId#architecture#…`, so it's the segment before the first `#`).
See "Deviations" — a future reconciliation could carry `snapshotId` on stored
results directly.

## Usage

```ts
import { EvaluationEngine, toEvaluationExportRow } from "./src/evaluation/index.ts";

const engine = new EvaluationEngine();                 // heuristic scorer by default
const metrics = engine.evaluate(storedExperimentResult);
const comparisons = engine.evaluateBatch(storedExperimentResults);
const row = toEvaluationExportRow(metrics);            // export-ready (no CSV here)
```

Demo: `npm run demo:evaluate` (mock provider; full pipeline → metrics).

## Errors

`EvaluationError` (base) — thrown when a required artifact is missing (no
validated result). `MetricCalculationError` — a calculator failed (identifies
the metric). `ComparisonError` — comparison failure. Missing *optional* evidence
signals never fail evaluation.

## Out of scope (future)

CSV writer, dashboards, statistical significance tests, synthetic
precision/recall/F1/localization, architecture-agreement / accepted-finding /
later-fix signals (after RFC-08/09).
