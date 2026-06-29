# AI Code Review Experiment Platform
## Software Architecture & Research Experiment Specification

**Document Version:** 1.0

**Status:** Draft

**Authors**

- En-Ping Su
- Tong Wu
- Shiting Huang
- Mengshan Li

**Last Updated**

July 2026

---

# 1. Introduction

## 1.1 Purpose

This document specifies the software architecture, implementation strategy, and experimental protocol for the AI Code Review Experiment Platform.

Unlike traditional software architecture documents, this specification serves three purposes simultaneously:

1. Software Architecture Specification
2. Research Experiment Protocol
3. Developer Implementation Guide

The primary objective is to provide sufficient technical detail for the development team to implement the platform while ensuring the resulting system produces reproducible and scientifically valid experimental data.

This document should be considered the authoritative reference for all implementation decisions throughout the project.

---

# 1.2 Background

Large Language Models (LLMs) have demonstrated strong capabilities in software engineering tasks, including code generation, testing, documentation, and automated code review.

Recent research suggests that multiple specialized LLM agents may outperform a single general-purpose agent for complex engineering tasks. However, existing work primarily evaluates final task performance while paying comparatively little attention to how different communication structures between agents influence review quality, computational cost, and coordination efficiency.

This project investigates three communication topologies for automated pull request review:

- Agentless Review
- Hierarchical Authority
- Decentralized Peer Consensus

Rather than building another production AI code reviewer, this project develops a reusable experimental platform capable of executing and evaluating multiple review architectures under controlled conditions.

The platform is designed to support reproducible experimentation throughout the development of the RAP Portal project.

---

# 1.3 Project Objectives

The platform has four primary objectives.

## Objective 1

Provide a reusable experimental platform capable of executing multiple automated code review architectures.

---

## Objective 2

Collect reproducible experimental data for evaluating multi-agent communication topologies.

---

## Objective 3

Support continuous experimentation using real pull requests generated during RAP Portal development.

---

## Objective 4

Provide an extensible research platform that can later evaluate pull requests from arbitrary GitHub repositories.

---

# 1.4 Scope

The platform is responsible for:

- importing pull requests
- parsing unified diffs
- executing review workflows
- validating structured outputs
- collecting execution metrics
- computing evaluation metrics
- exporting experimental datasets
- visualizing experiment results

The platform is **not** responsible for:

- replacing human code review
- automatically approving pull requests
- deploying reviewed software
- enforcing coding standards
- production DevOps workflows

---

# 1.5 Research Alignment

The platform is designed specifically to support the research described in the accompanying Work-in-Progress paper.

The software architecture intentionally separates the experimental infrastructure from the RAP Portal to ensure:

- reproducibility
- replayability
- controlled experimentation
- minimal interference with production development

Every major architectural decision in this document should therefore be evaluated according to a single guiding principle:

> Does this decision improve the quality, reproducibility, or fairness of the experimental data?

If the answer is **no**, the feature should not be implemented.

---

# 1.6 Intended Audience

This document is intended for:

### Development Team

Implementing the platform.

---

### Research Team

Conducting experiments and analysing results.

---

### Supervisors

Reviewing research methodology and implementation strategy.

---

### Future Researchers

Extending the platform for additional architectures or datasets.

---

# 1.7 Document Organization

This specification is organised into eight major parts.

| Part | Description |
|-------|-------------|
| Part I | System Vision |
| Part II | Research Methodology |
| Part III | Software Architecture |
| Part IV | Core Components |
| Part V | Review Architectures |
| Part VI | Evaluation |
| Part VII | Infrastructure |
| Part VIII | Project Management |

Appendices provide detailed implementation references, including:

- REST API specification
- TypeScript interfaces
- Database schema
- Prompt contracts
- JSON schemas
- Architecture Decision Records

---

# 1.8 Terminology

The following terminology is used consistently throughout this document.

---

## Pull Request (PR)

A GitHub pull request or equivalent code change submitted for review.

---

## PR Snapshot

An immutable copy of a pull request imported into the research platform.

The snapshot contains:

- metadata
- unified diff
- commit hash
- changed files
- changed line ranges

Snapshots never change after import.

---

## Experiment

The primary unit of execution within the platform.

An experiment consists of:

- one PR Snapshot
- one review architecture
- one model version
- one prompt version
- one workflow version

Experiments are immutable once completed.

---

## Review Architecture

A communication topology used to perform automated code review.

Current architectures include:

- Agentless
- Hierarchical Authority
- Decentralized Peer Consensus

The platform is designed to support additional architectures in future work.

---

## Agent

An autonomous LLM component responsible for performing a specialised review task.

Examples include:

- Frontend Agent
- Backend Agent
- Database Agent
- Manager Agent

---

## Workflow

The sequence of interactions between agents during an experiment.

Different review architectures define different workflows.

---

## Finding

A potential issue identified during code review.

Each finding contains:

- title
- severity
- category
- description
- recommendation
- confidence
- localisation information

---

## Evidence

Supporting information indicating whether a finding is likely to represent a genuine issue.

Evidence sources include:

- architecture agreement
- GitHub review comments
- future bug fixes
- static analysis
- optional human validation

---

## Metric

A quantitative measurement generated by the evaluation engine.

Examples include:

- precision
- recall
- latency
- token usage
- execution cost
- evidence score

---

# 1.9 Assumptions

The following assumptions guide the implementation.

- RAP Portal development continues throughout the project.
- Real pull requests become available during development.
- Synthetic pull requests can be created if additional experimental data is required.
- LLM APIs remain available throughout implementation.
- AWS services remain within the allocated research budget.
- Prompt engineering concludes before final experiments begin.

---

# 1.10 Success Criteria

The project will be considered successful if:

- all three review architectures are implemented
- every imported PR can be replayed through any architecture
- outputs conform to a common validated schema
- experiments execute asynchronously
- synthetic datasets produce precision, recall, and F1 metrics
- real RAP pull requests produce evidence-based evaluation metrics
- the platform exports reproducible datasets suitable for research publication

---

# 1.11 Version History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 2026 | Initial architecture specification |