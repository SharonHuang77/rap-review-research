# 02 — Benchmark Selection

**Document:** Benchmark Selection

**Version:** 1.0

**Status:** Approved

**Project:** Multi-Agent Architectures for AI-Assisted Code Review

---

# 1. Purpose

This document defines the benchmark datasets used to evaluate the three review architectures developed in this research:

- Agentless Review
- Hierarchical Review
- Consensus Review

Selecting appropriate evaluation datasets is one of the most important decisions in the research methodology. No single benchmark adequately measures every aspect of AI-assisted code review. Some datasets provide objective defect ground truth, while others capture real human review behaviour. Furthermore, benchmark datasets cannot fully represent industrial software engineering environments.

Therefore, this research intentionally combines multiple complementary datasets to evaluate different dimensions of code review performance.

The benchmark strategy has three objectives:

- objectively evaluate review correctness;
- evaluate agreement with experienced human reviewers;
- demonstrate applicability on a real industrial software project.

Together these datasets provide stronger evidence than any individual benchmark.

---

# 2. Benchmark Evaluation Strategy

The experimental evaluation consists of three complementary studies.

| Study | Dataset | Purpose |
|---------|----------|---------|
| **E1** | Qodo PR-Review-Bench | Objective correctness evaluation |
| **E2** | SWE-PRBench | Human reviewer agreement |
| **E3** | RAP Portal (Industrial Case Study) | Real-world operational validation |

Rather than asking a single question—

> "Which architecture is best?"

—the evaluation asks three independent questions:

### E1 — Correctness

Can an architecture correctly identify known review issues?

Measured using:

- Precision
- Recall
- F1
- Localization Accuracy

---

### E2 — Human Agreement

Can an architecture produce review comments similar to experienced software engineers?

Measured using:

- Review Coverage
- Human Agreement
- Review Precision

---

### E3 — Industrial Verification

Can the architecture produce credible review findings on an actively developed industrial software project in the absence of authoritative ground truth?

Because the RAP Portal does not contain labeled defects, correctness cannot be measured using Precision or Recall. Instead, findings are corroborated using multiple independent verification signals.

Measured using:

- Cross-Architecture Agreement
- Static Analysis Agreement
- LLM Judge Validation
- Later Fix Rate
- Evidence Score (supporting heuristic)
- Cost
- Latency
- Token Usage
- LLM Calls
- Message Count

---

# 3. Dataset Selection Criteria

Datasets were selected using the following criteria.

## Mandatory Criteria

Every benchmark must satisfy the following requirements.

- Pull-request based
- Publicly available (except the industrial case study)
- Reproducible
- Compatible with Git workflows
- Suitable for automated evaluation

---

## Preferred Criteria

Preference was given to datasets that provide:

- explicit ground truth
- real software repositories
- multiple programming languages
- active maintenance
- permissive licensing
- complete pull request context

---

## Excluded Characteristics

Datasets designed primarily for:

- bug fixing
- code generation
- algorithmic programming competitions
- automated program repair

were intentionally excluded because they do not evaluate the code review process itself.

---

# 4. Primary Benchmark

# Qodo PR-Review-Bench

## Purpose

Qodo PR-Review-Bench serves as the primary benchmark for evaluating objective review correctness.

It measures whether an architecture can correctly identify known review issues within pull requests.

---

## Official Sources

**Hugging Face**

https://huggingface.co/datasets/Qodo/PR-Review-Bench

**GitHub**

https://github.com/agentic-review-benchmarks

---

## Why Qodo?

Qodo PR-Review-Bench is currently the closest publicly available benchmark to the experimental workflow developed in this thesis.

Unlike software repair benchmarks, Qodo is specifically designed for AI code review.

Each benchmark instance contains:

- repository information
- pull request metadata
- unified git diff
- injected review issues
- file locations
- line numbers
- issue descriptions

This aligns almost perfectly with the architecture implemented in this research.

```
Pull Request

↓

Import Engine

↓

PR Snapshot

↓

Review Architecture

↓

Review Findings

↓

Ground Truth Evaluation
```

No transformation of the experimental workflow is required.

---

## Ground Truth

Ground truth consists of injected review issues.

Each issue specifies:

- affected file
- affected line(s)
- issue description

These annotations allow objective evaluation of review correctness.

Unlike human reviewer comments, injected issues provide an unambiguous reference for calculating Precision, Recall, and Localization Accuracy.

---

## Evaluation Metrics

Qodo is used to calculate:

- Precision
- Recall
- F1 Score
- Localization Accuracy
- False Positives
- False Negatives

These metrics represent the primary quantitative evaluation in this thesis.

---

## Strengths

Qodo offers several important advantages.

- Designed specifically for AI code review
- Pull-request based
- Explicit ground truth
- Multiple programming languages
- Publicly available
- Easily reproducible
- Compatible with automated evaluation

---

## Limitations

Despite its strengths, Qodo is still a synthetic benchmark.

Injected review issues cannot fully represent the diversity of problems encountered in industrial software development.

Consequently, Qodo evaluates correctness under controlled conditions rather than real-world engineering practice.

---

## Planned Sample Size

Target:

**30–50 pull requests**

Every pull request will be reviewed independently by:

- Agentless
- Hierarchical
- Consensus

Resulting in approximately:

```
40 PRs

×

3 architectures

=

120 benchmark experiments
```

---

# 5. Secondary Benchmark

# SWE-PRBench

## Purpose

SWE-PRBench evaluates agreement with experienced human reviewers.

Unlike Qodo, the benchmark does **not** measure whether injected defects are detected.

Instead, it evaluates whether AI-generated review comments resemble those produced by professional software engineers during real pull request reviews.

---

## Official Sources

**Research Paper**

https://arxiv.org/abs/2603.26130

The benchmark accompanies the published paper.

---

## Why SWE-PRBench?

Correctness alone is insufficient for evaluating AI-assisted code review.

Human reviewers often identify:

- maintainability concerns
- readability improvements
- API design suggestions
- architectural observations

that cannot easily be represented as injected defects.

SWE-PRBench captures these higher-level review behaviours.

Each benchmark instance provides:

- pull request
- code diff
- human review comments
- review annotations

Importantly, **the human review comments are already included in the benchmark dataset**.

No manual annotation is required for this research.

---

## Ground Truth

Ground truth consists of human review comments.

Evaluation therefore measures reviewer agreement rather than objective correctness.

The evaluator compares:

```
Human Review Comment

↓

Ground Truth Issue

↓

Issue Matcher

↓

Semantic Matcher

↓

Matched / Not Matched
```

Initially, this research uses the RFC-13 `NoopSemanticMatcher`.

Future work may replace this with embedding-based or LLM-based semantic matching.

---

## Evaluation Metrics

SWE-PRBench contributes:

- Review Coverage
- Human Agreement Rate
- Review Precision
- False Positive Review Comments

Unlike Qodo, Precision and Recall should be interpreted as agreement metrics rather than objective defect detection metrics.

---

## Strengths

- Real software projects
- Real pull requests
- Human-authored review comments
- Industrial review behaviour
- Complements synthetic benchmarks

---

## Limitations

Human reviewers frequently disagree.

Consequently there is no single objectively correct review.

Results from SWE-PRBench should therefore be interpreted as agreement with expert reviewers rather than absolute correctness.

---

## Planned Sample Size

Target:

**20–30 pull requests**

Each pull request will again be evaluated using:

- Agentless
- Hierarchical
- Consensus

ensuring consistency with the primary benchmark.

# 6. Industrial Case Study

# RAP Portal

## Repository

**Repository**

https://github.com/logisticPM/portal

**Repository Visibility**

Private

Access is limited to authorized members of the industry partner and research team.

Although the repository is not publicly accessible, it represents the primary real-world case study used throughout this research.

---

## Purpose

The RAP Portal is **not** treated as a benchmark dataset.

Instead, it serves as an **industrial case study** to evaluate whether the proposed research platform operates successfully on a realistic software engineering project.

Unlike benchmark datasets, the RAP Portal does not provide authoritative ground truth for every review finding.

Therefore, it is used to evaluate operational characteristics rather than objective correctness.

---

## Why Include an Industrial Case Study?

Public benchmarks provide controlled evaluation.

However, they cannot fully represent the complexity of an actively developed software project.

The RAP Portal allows evaluation of:

- realistic pull requests
- evolving software architecture
- multiple contributors
- genuine engineering decisions
- production-oriented code

This improves the ecological validity of the research.

---

## Evaluation Metrics

Unlike the public benchmark datasets, the RAP Portal does not provide authoritative ground truth. Therefore, the industrial case study evaluates the credibility of review findings using multiple complementary verification signals.

### Verification Metrics

#### Cross-Architecture Agreement

Each pull request is reviewed independently by:

- Agentless
- Hierarchical
- Consensus

Findings independently identified by multiple architectures are considered more credible than findings produced by a single architecture.

Agreement is calculated by matching findings based on:

- file
- line
- category
- title similarity

The percentage of corroborated findings is reported as the **Architecture Agreement** metric.

---

#### Static Analysis Agreement

Each pull request is also analysed using conventional static analysis tools appropriate to the project's technology stack (for example linters, type checkers, and security or SAST scanners).

Findings that coincide with issues independently reported by an established static analysis tool are considered more credible.

Static analysis provides an automated, reproducible external reference that does not depend on the availability of human review comments. Matching is based on file, line, and rule or category correspondence.

The proportion of AI findings corroborated by static analysis is reported as the **Static Analysis Agreement** metric.

Because static analysis tools have their own false positives and coverage limitations, this signal is treated as corroboration rather than authoritative ground truth.

---

#### LLM Judge Validation

Each AI-generated finding is independently assessed by a separate LLM acting as an impartial judge, distinct from the review architectures that produced the finding.

Given the pull request diff and the finding, the judge classifies each finding as:

- Valid
- Invalid
- Uncertain

This provides scalable automated adjudication in place of scarce human review effort. The proportion of findings classified as valid is reported as the **LLM Judge Validation** metric.

Because an LLM judge can share biases with the reviewer models, it is treated as a supporting corroboration signal rather than authoritative ground truth.

---

#### Later Fix Rate

For merged pull requests, the subsequent Git history is analysed to determine whether code associated with an AI finding was modified or corrected in later commits.

Although subsequent modification does not prove the AI finding was correct, it provides additional external evidence supporting the relevance of the reported issue.

---

#### Evidence Score

The platform also reports the existing Evidence Score.

Evidence Score is a heuristic confidence metric derived from:

- severity
- model confidence
- finding volume

It represents the strength of the AI review rather than objective correctness and should therefore be interpreted only as a supporting indicator.

## Not Used For

The RAP Portal is **not** used to report:

- Precision
- Recall
- F1
- Localization Accuracy

because no authoritative ground truth exists.

Any correctness claims made in this thesis are based solely on the public benchmark datasets.

---

## Planned Sample Size

Target:

10–20 pull requests

Each pull request will be reviewed independently using:

- Agentless
- Hierarchical
- Consensus

---

# 7. External Reference Benchmark

# Martian Code Review Benchmark

## Official Sources

GitHub

https://github.com/withmartian/code-review-benchmark

Benchmark Website

https://codereview.withmartian.com/

---

## Purpose

The Martian benchmark is **not directly executed** in this research.

Instead, it is referenced as an independent industry benchmark for AI-assisted code review.

It provides useful context for discussing:

- benchmark methodology
- evaluation metrics
- industry trends
- external validity

Using Martian allows this research to position itself relative to existing commercial benchmarking efforts.

---

# 8. Datasets Considered but Rejected

Several existing software engineering datasets were evaluated during the benchmark selection process but were ultimately excluded.

---

## SWE-bench

Purpose:

Software repair.

Decision:

Rejected.

Reason:

SWE-bench evaluates whether an LLM can generate patches that fix software defects.

The focus of this thesis is code review rather than automated program repair.

---

## Defects4J

Purpose:

Java defect benchmark.

Decision:

Rejected.

Reason:

Designed for testing automated bug repair.

Not structured around pull request review.

Limited to Java.

---

## HumanEval

Purpose:

Code generation.

Decision:

Rejected.

Reason:

Evaluates functional correctness of generated programs rather than review quality.

---

## MBPP

Purpose:

Program synthesis.

Decision:

Rejected.

Reason:

Measures code generation rather than software review.

---

## LeetCode-style datasets

Decision:

Rejected.

Reason:

Algorithmic programming exercises do not represent collaborative software engineering or pull request review.

---

# 9. Benchmark Comparison

| Dataset | Public | Ground Truth | Primary Purpose | Correctness | Human Agreement | Operational Metrics |
|----------|:------:|:------------:|----------------|:-----------:|:---------------:|:-------------------:|
| Qodo PR-Review-Bench | ✅ | Injected Issues | Objective correctness | ✅ | ❌ | ✅ |
| SWE-PRBench | ✅ | Human Comments | Reviewer agreement | ◐ | ✅ | ✅ |
| RAP Portal | ❌ | None | Industrial validation | ❌ | ❌ | ✅ |
| Martian (Reference) | ✅ | Industry Benchmark | Related work | — | — | — |

Legend:

- ✅ Primary use
- ◐ Approximate / agreement-based
- ❌ Not applicable
- — Not executed

---

# 10. Benchmark Execution Pipeline

Every dataset follows the identical evaluation pipeline.

```
Benchmark Instance

↓

Import Engine

↓

PR Snapshot

↓

Agentless

↓

Hierarchical

↓

Consensus

↓

Validation Engine

↓

Storage Engine

↓

Evaluation Engine

↓

Ground Truth Evaluation

↓

Export Service

↓

Research Workbench
```

Only the review architecture changes.

Everything else remains constant.

---

# 11. Fairness Policy

To ensure a fair comparison, every benchmark instance is evaluated under identical conditions.

The following remain fixed:

- pull request
- benchmark dataset
- unified diff
- validation engine
- evaluation engine
- export service
- prompt version
- Bedrock model
- AWS region
- temperature
- top-p
- maximum output tokens

The **only independent variable** is the review architecture:

- Agentless
- Hierarchical
- Consensus

This isolates the effect of communication topology on review performance.

---

# 12. Metrics by Dataset

The three evaluation datasets serve different research purposes and therefore support different evaluation metrics.

Public benchmark datasets provide objective or human-referenced evaluation, while the RAP Portal industrial case study focuses on corroborating AI-generated findings through independent verification signals rather than authoritative ground truth.

| Metric | Qodo PR-Review-Bench | SWE-PRBench | RAP Portal |
|---------|:--------------------:|:-----------:|:----------:|
| Precision | ✅ | ◐ | ❌ |
| Recall | ✅ | ◐ | ❌ |
| F1 Score | ✅ | ◐ | ❌ |
| Localization Accuracy | ✅ | ❌ | ❌ |
| Human Review Agreement | ❌ | ✅ | ❌ |
| Cross-Architecture Agreement | ❌ | ❌ | ✅ |
| Static Analysis Agreement | ❌ | ❌ | ✅ |
| LLM Judge Validation | ❌ | ❌ | ✅ |
| Later Fix Rate | ❌ | ❌ | ✅ |
| Evidence Score (Supporting Heuristic) | ❌ | ❌ | ✅ |
| Finding Count | ✅ | ✅ | ✅ |
| Estimated Cost | ✅ | ✅ | ✅ |
| Latency | ✅ | ✅ | ✅ |
| Input Tokens | ✅ | ✅ | ✅ |
| Output Tokens | ✅ | ✅ | ✅ |
| LLM Calls | ✅ | ✅ | ✅ |
| Message Count | ✅ | ✅ | ✅ |

**Legend**

- **✅** Primary evaluation metric for the dataset.
- **◐** Approximate metric interpreted as reviewer agreement rather than objective correctness.
- **❌** Not applicable or not reported.

### Interpretation

The metrics collected from each dataset should be interpreted according to the type of evidence they provide.

**Qodo PR-Review-Bench** provides authoritative ground truth through injected review issues and therefore supports objective correctness metrics such as Precision, Recall, F1 Score, and Localization Accuracy.

**SWE-PRBench** contains real human review comments rather than objectively labeled defects. Metrics such as Precision, Recall, and F1 therefore measure agreement with experienced human reviewers instead of absolute correctness.

**RAP Portal** is an industrial case study without authoritative ground truth. Consequently, correctness metrics are intentionally not reported. Instead, review credibility is evaluated using multiple independent verification signals:

- **Cross-Architecture Agreement** measures whether multiple review architectures independently identify the same issue.
- **Static Analysis Agreement** measures whether AI-generated findings coincide with issues independently reported by conventional static analysis tools run on the same pull request.
- **LLM Judge Validation** measures the proportion of AI findings judged valid by a separate, impartial LLM given the pull request diff.
- **Later Fix Rate** measures whether code associated with an AI finding is subsequently modified or corrected in later commits.
- **Evidence Score** is retained as a supporting heuristic that reflects the strength of an AI review based on severity, confidence, and finding volume, but it is **not interpreted as a measure of correctness**.

Operational metrics—including cost, latency, token usage, LLM calls, and message count—are collected consistently across all datasets to enable fair comparison of computational efficiency between review architectures.

# 13. Sample Size Justification

The planned experimental campaign includes:

| Dataset | Target PRs | Architectures | Total Runs |
|----------|-----------:|--------------:|-----------:|
| Qodo | 40 | 3 | 120 |
| SWE-PRBench | 25 | 3 | 75 |
| RAP Portal | 15 | 3 | 45 |

Estimated total:

**240 experiment executions**

This sample size balances statistical power with practical constraints such as Bedrock inference cost and execution time.

---

# 14. Licensing and Data Access

## Qodo PR-Review-Bench

Publicly available.

Used according to its published licensing terms.

---

## SWE-PRBench

Public academic benchmark.

Used for research purposes in accordance with its published licensing and citation requirements.

---

## RAP Portal

Private repository.

Used under authorization from the project owner.

No source code will be redistributed.

Only aggregated evaluation results will be reported.

---

# 15. Risks

Potential risks include:

- benchmark schema evolution
- model version changes
- benchmark language imbalance
- imperfect human reviewer agreement
- limited industrial sample size
- prompt sensitivity
- Bedrock model updates

These risks are discussed further in **05-threats-to-validity.md**.

---

# 16. Benchmark Freeze Policy

Once experimentation begins:

- benchmark datasets will not change
- benchmark subsets will be fixed
- prompt versions will be frozen
- evaluation metrics will remain unchanged
- export column names will remain stable

If any change affects benchmark outcomes, all affected experiments must be rerun.

---

# 17. Future Benchmark Extensions

Future work may incorporate additional datasets such as:

- Code Review Bench
- CodeFuse CR Bench
- organization-specific repositories
- additional industrial case studies

These datasets are outside the scope of the current thesis.

---

# 18. Summary

This research deliberately combines complementary evaluation methodologies.

Qodo PR-Review-Bench provides objective correctness through labeled review defects. SWE-PRBench evaluates agreement with experienced human reviewers using real pull request discussions. The RAP Portal extends the evaluation into an industrial environment where authoritative ground truth is unavailable and human review comments are scarce. Instead of measuring correctness directly, the industrial case study corroborates AI findings through automated, reproducible verification signals — cross-architecture agreement, agreement with conventional static analysis tools, independent LLM-judge validation, and subsequent code modifications — with the Evidence Score retained only as a supporting heuristic. Together, these datasets provide a comprehensive evaluation framework that measures correctness, reviewer agreement, operational efficiency, and industrial applicability while ensuring that review architecture remains the only independent variable throughout the experimental campaign.


---

# References

1. **Qodo PR-Review-Bench**
   - Hugging Face: https://huggingface.co/datasets/Qodo/PR-Review-Bench
   - GitHub: https://github.com/agentic-review-benchmarks

2. **SWE-PRBench**
   - Paper: https://arxiv.org/abs/2603.26130

3. **Martian Code Review Benchmark**
   - GitHub: https://github.com/withmartian/code-review-benchmark
   - Website: https://codereview.withmartian.com/

4. **RAP Portal**
   - Private repository: https://github.com/logisticPM/portal