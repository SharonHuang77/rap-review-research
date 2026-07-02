# 07 — Research Evaluation Engine

**Module:** Research Evaluation Engine

**Status:** Ready for Implementation

**Dependencies:**

- RFC-01 Experiment Engine
- RFC-05 Validation & Result Processing Engine
- RFC-06 Storage Engine

---

# 1. Purpose

The Research Evaluation Engine computes quantitative metrics from completed experiments.

It transforms stored experiment artifacts into standardized evaluation metrics suitable for statistical analysis and publication.

Unlike previous RFCs, this module is part of the research methodology rather than the execution platform.

The Evaluation Engine is the component that converts experiment executions into the dataset used by the thesis.

---

# 2. Research Motivation

The objective of this research is to compare three review architectures:

- Agentless
- Hierarchical Authority
- Decentralized Peer Consensus

Each architecture reviews the exact same Pull Request Snapshot.

To compare these architectures fairly, every completed experiment must be evaluated using identical metrics.

The Evaluation Engine provides those metrics.

This RFC defines **how experimental performance is measured**, not how reviews are generated.

---

# 3. Responsibilities

The Evaluation Engine is responsible for:

- computing experiment metrics
- computing batch experiment metrics
- measuring review quality
- measuring operational cost
- computing research evidence metrics
- preparing experiment comparisons
- preparing exportable research records

The Evaluation Engine is **not** responsible for:

- running review architectures
- importing pull requests
- validating JSON
- storing experiment artifacts
- rendering dashboards
- performing statistical significance tests

---

# 4. Architecture

```text
StoredExperimentResult
        │
        ▼
Evaluation Engine
        │
        ├──────────────┐
        ▼              ▼
Review Metrics   Cost Metrics
        │              │
        └──────┬───────┘
               ▼
      Evidence Scorer
               │
               ▼
      ExperimentMetrics
               │
               ▼
    ExperimentComparison
```

Every calculation component should perform one responsibility.

---

# 5. Evaluation Modes

The Evaluation Engine supports two evaluation modes.

## Synthetic Benchmark Mode

Used for experiments containing injected defects.

Ground truth is known.

Metrics include:

- Precision
- Recall
- F1 Score
- Localization Accuracy
- False Positives
- False Negatives

---

## Real Pull Request Mode

Used for live RAP Portal pull requests.

Ground truth does not exist.

Metrics include:

- Evidence Score
- Architecture Agreement
- Accepted Finding Rate
- Later Fix Rate
- Operational Cost

The Evaluation Engine must support both modes without changing its architecture.

---

# 6. Evaluation Categories

Three independent categories are evaluated.

---

## Review Quality

Measures review effectiveness.

Metrics include:

- Finding Count
- Severity Distribution
- Confidence Distribution
- Duplicate Findings
- Localization Accuracy (synthetic mode)

---

## Operational Cost

Measures execution efficiency.

Metrics include:

- Latency
- Input Tokens
- Output Tokens
- Estimated Cost
- LLM Calls
- Message Count

---

## Research Evidence

Measures experimental usefulness.

Metrics include:

- Evidence Score
- Architecture Agreement
- Accepted Finding Rate
- Later Fix Rate

These metrics may evolve as the research progresses.

---

# 7. ExperimentMetrics

```ts
export interface ExperimentMetrics {

    experimentId: string;

    architecture: ReviewArchitecture;

    reviewQuality: ReviewQualityMetrics;

    operationalCost: OperationalCostMetrics;

    researchEvidence: ResearchEvidenceMetrics;

}
```

This is the primary output of the Evaluation Engine.

---

# 8. ReviewQualityMetrics

```ts
export interface ReviewQualityMetrics {

    findingCount: number;

    lowSeverityCount: number;

    mediumSeverityCount: number;

    highSeverityCount: number;

    criticalSeverityCount: number;

    averageConfidence: number;

    duplicateFindingCount: number;

    localizationAccuracy?: number;

}
```

Localization Accuracy is only applicable when synthetic benchmark data provides known defect locations.

---

# 9. OperationalCostMetrics

```ts
export interface OperationalCostMetrics {

    latencyMs: number;

    inputTokens: number;

    outputTokens: number;

    estimatedCostUsd: number;

    llmCalls: number;

    messageCount: number;

}
```

These metrics are collected directly from the experiment execution.

No additional calculations should modify these values.

---

# 10. ResearchEvidenceMetrics

```ts
export interface ResearchEvidenceMetrics {

    evidenceScore: number;

    architectureAgreement?: number;

    acceptedFindingRate?: number;

    laterFixRate?: number;

}
```

Not every metric is immediately available.

Future architectures and long-term experiment data will populate additional fields.

Missing optional values should never cause evaluation failure.

---

# 11. Evidence Scoring Strategy

At this stage of the project, the platform does not yet have sufficient information to compute the final research Evidence Score.

Signals such as:

- reviewer acceptance
- later fix rate
- architecture agreement

will only become available after additional review architectures are implemented and real-world experiments have been collected.

Therefore, RFC-07 **must not hard-code the final Evidence Score algorithm**.

Instead, Evidence Scoring shall be implemented using a pluggable strategy interface.

```ts
export interface IEvidenceScorer {

    calculate(
        result: StoredExperimentResult
    ): ResearchEvidenceMetrics;

}
```

The Evaluation Engine should depend only on this interface.

---

## Initial Implementation

RFC-07 should implement:

```ts
export class HeuristicEvidenceScorer
    implements IEvidenceScorer {

    calculate(
        result: StoredExperimentResult
    ): ResearchEvidenceMetrics {

        // Initial heuristic implementation

    }

}
```

The heuristic scorer may use:

- finding count
- severity weighting
- average confidence

These values are already available in RFC-07.

---

## Future Implementation

Later RFCs will introduce:

```ts
export class FinalEvidenceScorer
    implements IEvidenceScorer {

    calculate(
        result: StoredExperimentResult
    ): ResearchEvidenceMetrics {

        // Final research algorithm

    }

}
```

Additional signals may include:

- architecture agreement
- reviewer acceptance
- later fix rate
- replay evidence
- historical calibration

The Evaluation Engine must not require modification when this scorer is introduced.

---

# 12. Metric Calculators

Each metric category should have its own calculator.

```
src/evaluation/

evaluation-engine.ts

finding-metrics.ts

cost-metrics.ts

evidence-metrics.ts

comparison-engine.ts

evaluation-errors.ts

README.md
```

Responsibilities:

FindingMetricsCalculator

- finding count
- severity counts
- confidence statistics
- duplicate detection

CostMetricsCalculator

- latency
- token usage
- API cost
- LLM calls
- message count

EvidenceMetricsCalculator

- delegates to IEvidenceScorer

ComparisonEngine

- compares multiple ExperimentMetrics

---

# 13. ExperimentComparison

```ts
export interface ExperimentComparison {

    experimentId: string;

    architectures: ExperimentMetrics[];

}
```

This model enables side-by-side comparison between:

- Agentless
- Hierarchical
- Consensus

The comparison object contains no presentation logic.

---

# 14. Export Model

The Evaluation Engine prepares export-ready records.

CSV writing belongs to a future Export Service.

```ts
export interface EvaluationExportRow {

    experimentId: string;

    architecture: ReviewArchitecture;

    findingCount: number;

    highSeverityCount: number;

    criticalSeverityCount: number;

    averageConfidence: number;

    latencyMs: number;

    inputTokens: number;

    outputTokens: number;

    estimatedCostUsd: number;

    llmCalls: number;

    messageCount: number;

    evidenceScore: number;

}
```

Each experiment should produce exactly one export row.

---

# 15. Evaluation Workflow

## Single Experiment

```text
StoredExperimentResult
        │
        ▼
Finding Metrics
        │
        ▼
Cost Metrics
        │
        ▼
Evidence Scorer
        │
        ▼
ExperimentMetrics
```

---

## Batch Evaluation

```text
StoredExperimentResult[]
        │
        ▼
Evaluation Engine
        │
        ▼
ExperimentMetrics[]
        │
        ▼
Comparison Engine
        │
        ▼
ExperimentComparison[]
```

Batch evaluation should internally reuse the single-experiment evaluation pipeline.

The Evaluation Engine should not duplicate metric calculation logic.

---

# 16. Public Interface

The Evaluation Engine should support both single-experiment and batch evaluation.

```ts
export interface IEvaluationEngine {

    evaluate(
        result: StoredExperimentResult
    ): ExperimentMetrics;

    evaluateBatch(
        results: StoredExperimentResult[]
    ): ExperimentComparison[];

}
```

The default implementation of `evaluateBatch()` may simply iterate over the collection and call `evaluate()` for each experiment.

Future implementations may optimize batch processing without changing the public interface.

The Evaluation Engine should remain stateless.

---

# 17. Inputs

The Evaluation Engine consumes only:

- StoredExperimentResult
- StoredRawReviewResult
- StoredValidatedReviewResult
- StoredReviewFinding
- ValidationMetadata

The Evaluation Engine must not access repositories directly.

Experiment Engine provides all required inputs.

---

# 18. Error Handling

Implement typed errors.

```text
EvaluationError

MetricCalculationError

ComparisonError
```

Evaluation failures should identify the metric that failed.

Missing optional values should never fail evaluation.

Missing required experiment artifacts should.

---

# 19. Testing Strategy

## Unit Tests

Verify:

- finding counting
- severity distribution
- confidence averaging
- duplicate detection
- cost calculations
- heuristic evidence score
- comparison generation
- export row generation

All tests should be deterministic.

---

## Integration Tests

Implement:

```
StoredExperimentResult

↓

Evaluation Engine

↓

ExperimentMetrics

↓

ExperimentComparison
```

Test both:

- synthetic benchmark mode
- real pull request mode

Mock data should be sufficient.

No LLM calls.

No Bedrock.

---

# 20. Folder Structure

```
src/

evaluation/

    evaluation-engine.ts

    finding-metrics.ts

    cost-metrics.ts

    evidence-metrics.ts

    comparison-engine.ts

    evaluation-errors.ts

    README.md

    models/

        experiment-metrics.ts

        experiment-comparison.ts

        evaluation-export-row.ts

    scorers/

        evidence-scorer.ts

        heuristic-evidence-scorer.ts
```

Future scorers may be added without modifying Evaluation Engine.

---

# 21. Acceptance Criteria

- [ ] ExperimentMetrics implemented
- [ ] ReviewQualityMetrics implemented
- [ ] OperationalCostMetrics implemented
- [ ] ResearchEvidenceMetrics implemented
- [ ] IEvidenceScorer implemented
- [ ] HeuristicEvidenceScorer implemented
- [ ] ExperimentComparison implemented
- [ ] EvaluationExportRow implemented
- [ ] Finding metrics calculated
- [ ] Cost metrics calculated
- [ ] Evidence score calculated
- [ ] Comparison generation implemented
- [ ] Export rows generated
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] npm run check passes

---

# 22. AI Implementation Checklist

Before submitting:

- [ ] Read RFC-05 Validation Engine
- [ ] Read RFC-06 Storage Engine
- [ ] No repository access inside metric calculators
- [ ] No LLM calls
- [ ] No validation logic
- [ ] No dashboard logic
- [ ] No storage logic
- [ ] Metric calculators remain deterministic
- [ ] Evaluation Engine depends on IEvidenceScorer
- [ ] Final Evidence Score is not hard-coded
- [ ] Single experiment evaluation implemented
- [ ] Batch evaluation implemented
- [ ] Tests included
- [ ] Documentation updated


---

# 23. Out of Scope

Do not implement:

- Dashboard
- CSV writer
- Graph generation
- Statistical significance testing
- Replay UI
- Hierarchical Architecture
- Consensus Architecture
- Human reviewer workflows

This RFC ends with the production of:

- ExperimentMetrics
- ExperimentComparison
- EvaluationExportRow

---

# 24. Future Improvements

Future versions may support:

## Synthetic Benchmark Metrics

- Precision
- Recall
- F1 Score
- False Positive Rate
- False Negative Rate
- Localization Accuracy

## Real PR Metrics

- Architecture Agreement
- Reviewer Acceptance
- Later Fix Rate
- Replay Validation
- Cross-run Stability

## Advanced Statistics

- Cohen's Kappa
- Krippendorff's Alpha
- Bootstrap Confidence Intervals
- Mann–Whitney U Test
- Wilcoxon Signed-Rank Test
- ANOVA
- Effect Size Analysis

These belong to future research iterations and should not complicate the initial implementation.

---

# Summary

The Research Evaluation Engine transforms completed experiments into standardized, reproducible research metrics.

Unlike previous RFCs, this module represents the experimental methodology rather than platform infrastructure.

By separating Review Quality, Operational Cost, and Research Evidence into independent metric calculators—and introducing a pluggable `IEvidenceScorer` strategy—the Evaluation Engine remains deterministic, extensible, and capable of evolving as additional architectures and real-world evaluation signals become available.

The output of this RFC forms the canonical research dataset used by subsequent comparison, visualization, CSV export, and statistical analysis stages of the thesis.