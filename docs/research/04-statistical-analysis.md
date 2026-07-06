# 04 — Statistical Analysis

**Document:** Statistical Analysis Plan

**Version:** 1.0

**Status:** Approved

**Project:** Multi-Agent Architectures for AI-Assisted Code Review

---

# 1. Purpose

This document defines the statistical methodology used to analyse all experimental results produced by the AI-assisted code review platform.

The purpose of the analysis is to determine whether differences observed between review architectures are statistically meaningful rather than the result of random variation.

This document specifies:

- statistical metrics
- aggregation procedures
- hypothesis testing
- significance thresholds
- visualization methods
- reporting standards

The analysis plan is defined before benchmark execution to avoid post-hoc selection of statistical methods.

---

# 2. Research Questions

The statistical analysis addresses the following research questions.

## RQ1

Does Hierarchical Review improve review correctness compared with Agentless Review?

---

## RQ2

Does Consensus Review improve review correctness compared with Hierarchical Review?

---

## RQ3

What additional computational cost is introduced by increasing communication complexity?

---

## RQ4

Which review architecture provides the best balance between correctness and efficiency?

---

# 3. Experimental Design

This research follows a repeated-measures experimental design.

Each benchmark instance is reviewed by all three architectures.

```
PR #001

↓

Agentless

↓

Hierarchical

↓

Consensus
```

Therefore every benchmark instance serves as its own control.

This substantially reduces variability caused by differences between pull requests.

---

# 4. Independent Variable

Review Architecture

Three levels:

- Agentless
- Hierarchical
- Consensus

No other experimental factor changes.

---

# 5. Dependent Variables

## Correctness

- Precision
- Recall
- F1 Score
- Localization Accuracy

---

## Review Quality

- Finding Count
- Confidence
- Evidence Score

---

## Communication

- Message Count
- LLM Calls

---

## Efficiency

- Cost
- Latency
- Total Tokens

---

# 6. Descriptive Statistics

For every metric the following descriptive statistics will be reported.

Mean

Median

Minimum

Maximum

Standard Deviation

Interquartile Range

95% Confidence Interval

These statistics will be calculated independently for each architecture.

---

# 7. Benchmark Aggregation

Metrics are first calculated per benchmark instance.

Example

```
PR 17

↓

Agentless

Precision

Recall

Latency

↓

Hierarchical

Precision

Recall

Latency

↓

Consensus

Precision

Recall

Latency
```

Only after all benchmark instances have been evaluated are aggregate statistics computed.

---

# 8. Correctness Metrics

The following benchmark metrics are calculated.

Precision

Recall

F1

Localization Accuracy

False Positives

False Negatives

False Discovery Rate

These metrics are obtained from the Ground Truth Evaluation Engine (RFC-13).

---

# 9. Operational Metrics

The following operational metrics are reported.

Latency

Estimated Cost

Input Tokens

Output Tokens

Total Tokens

LLM Calls

Message Count

These metrics are obtained directly from the experiment platform.

---

# 10. Communication Metrics

Communication complexity is evaluated using:

- Message Count
- LLM Calls
- Duplicate Findings
- Architecture Agreement

Hierarchical and Consensus architectures additionally report:

- Specialist Count
- Merge Time
- Agreement Rate (Consensus)

---

# 11. Statistical Hypotheses

## H1

Hierarchical Recall > Agentless Recall

---

## H2

Consensus Precision > Hierarchical Precision

---

## H3

Consensus Cost > Hierarchical Cost > Agentless Cost

---

## H4

Consensus Latency > Hierarchical Latency > Agentless Latency

---

## H5

Increasing communication improves correctness with diminishing returns.

---

# 12. Statistical Tests

Because every architecture evaluates the same pull requests, observations are paired.

Therefore paired statistical tests will be used.

## Primary Analysis

Wilcoxon Signed-Rank Test

Used for:

- Precision
- Recall
- F1
- Localization
- Cost
- Latency

The Wilcoxon Signed-Rank Test is selected because metric distributions may not satisfy normality assumptions and the sample size is expected to be moderate.

---

## Multiple Comparisons

Three pairwise comparisons will be performed.

Agentless vs Hierarchical

Hierarchical vs Consensus

Agentless vs Consensus

To control the family-wise error rate, p-values will be adjusted using the Holm–Bonferroni correction.

---

# 13. Effect Size

Statistical significance alone is insufficient.

For every comparison an effect size will also be reported.

Effect sizes will be interpreted using conventional thresholds.

Small

Medium

Large

Reporting effect size allows practical significance to be distinguished from statistical significance.

---

# 14. Significance Level

The significance threshold is:

α = 0.05

Adjusted p-values after Holm–Bonferroni correction determine statistical significance.

---

# 15. Confidence Intervals

For every reported mean:

95% confidence intervals will be calculated.

Confidence intervals provide an estimate of uncertainty around the observed metrics.

---

# 16. Visualization

The following figures will be produced.

## Correctness

Bar charts

Precision

Recall

F1

Localization

---

## Cost

Box plots

Latency

Cost

Tokens

---

## Communication

Bar charts

LLM Calls

Message Count

---

## Trade-offs

Scatter plots

Precision vs Cost

Recall vs Latency

Evidence Score vs Cost

---

## Overall Comparison

Radar chart

Precision

Recall

Latency

Cost

Message Count

Evidence Score

---

# 17. Reporting Format

Every metric will be reported using the following format.

| Architecture | Mean | Std Dev | 95% CI | p-value | Effect Size |
|--------------|------|---------|---------|----------|-------------|

No statistical conclusions will be drawn solely from visual inspection.

---

# 18. Missing Data

Failed benchmark executions will be excluded from statistical analysis.

The reason for exclusion must be documented.

No metric values will be imputed.

---

# 19. Reproducibility

All statistical analysis will be generated automatically from exported benchmark CSV files.

Manual editing of experimental data is prohibited.

Every figure and table must be reproducible from the exported datasets.

---

# 20. Outputs

The statistical analysis will produce:

- Descriptive statistics tables
- Pairwise comparison tables
- Hypothesis test results
- Effect size tables
- Confidence intervals
- Publication-quality figures
- Thesis-ready tables

---

# 21. Future Extensions

Future work may incorporate:

- Bayesian statistical analysis
- Bootstrap confidence intervals
- Mixed-effects models
- Cross-language subgroup analysis
- Model-to-model comparisons

These analyses are outside the scope of the current thesis.

---

# 22. Summary

This statistical analysis plan defines the methodology used to evaluate the experimental results generated by the AI-assisted code review platform.

By combining descriptive statistics, paired hypothesis testing, effect size estimation, confidence intervals, and standardized visualizations, the analysis provides a rigorous framework for comparing Agentless, Hierarchical, and Consensus review architectures. Because all architectures evaluate the same benchmark instances under identical experimental conditions, the resulting comparisons isolate the effect of communication topology while minimizing confounding factors, enabling statistically sound conclusions about review correctness, efficiency, and operational trade-offs.