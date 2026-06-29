# 2. Architecture Principles & Design Decisions

This chapter defines the fundamental architectural principles that govern the design and implementation of the AI Code Review Experiment Platform.

These principles are considered mandatory engineering constraints rather than implementation suggestions. Every subsystem described in this specification must conform to these principles.

The objective is to ensure that the resulting platform produces reliable, reproducible, and scientifically valid experimental data while remaining practical to implement within the project timeline.

---

# Principle 1 — Experiment-Centric Architecture

## Motivation

Traditional code review systems are centred around pull requests.

However, this project is not building a production code review tool.

The primary objective is to conduct controlled experiments that compare different review architectures.

Therefore, the platform is centred around **Experiments**, not pull requests.

---

## Design Decision

The Experiment is the primary entity within the system.

Every experiment records:

- PR Snapshot
- Review Architecture
- Model Version
- Prompt Version
- Workflow Version
- Evaluation Version

The Experiment Controller is responsible for orchestrating execution and collecting metrics.

---

## Architecture

```text
Experiment
      │
      ├── PR Snapshot
      ├── Architecture
      ├── Prompt Version
      ├── Model Version
      └── Workflow Version
                │
                ▼
        Execute Experiment
                │
                ▼
         Research Dataset
```

---

## Rationale

This architecture enables:

- reproducibility
- replayability
- prompt versioning
- model comparison
- architecture comparison

without modifying historical experiment data.

---

# Principle 2 — Complete Separation Between Research and Production

## Motivation

The RAP Portal is the production software developed during the capstone project.

The research platform is an experimental system.

Mixing both systems would introduce unnecessary coupling and risk affecting production development.

---

## Design Decision

The research platform shall be implemented as an independent application with its own repository, deployment pipeline, and data storage.

The RAP Portal acts only as an experiment source.

---

## Architecture

```text
                RAP Portal

                     │

         GitHub Pull Requests

                     │

                     ▼

     AI Code Review Experiment Platform

                     │

          Research Database
```

---

## Consequences

Advantages

- independent deployment
- independent releases
- reusable research platform
- isolated datasets

Trade-offs

- additional repository
- duplicated authentication if required
- separate deployment pipeline

The advantages significantly outweigh the additional maintenance cost.

---

# Principle 3 — Immutable PR Snapshots

## Motivation

GitHub repositories evolve continuously.

If pull requests are re-imported directly from GitHub, experiments become non-reproducible.

---

## Design Decision

Every imported pull request shall be converted into an immutable PR Snapshot.

A snapshot contains:

- repository
- commit hash
- metadata
- unified diff
- changed files
- changed line ranges

Snapshots are never modified after creation.

---

## Architecture

```text
GitHub PR

        │

Import Once

        │

        ▼

Immutable PR Snapshot

        │

Replay Forever
```

---

## Benefits

Replay

Historical comparison

Version consistency

Research reproducibility

---

# Principle 4 — Replayability

## Motivation

The three review architectures will not be completed simultaneously.

Replay allows previously collected pull requests to be evaluated by newly implemented architectures.

---

## Design Decision

Every PR Snapshot shall be executable by any review architecture at any time.

Replay is therefore a mandatory system capability.

---

## Example

```text
Week 1

PR-15

↓

Agentless

Week 3

PR-15

↓

Hierarchical

Week 4

PR-15

↓

Consensus
```

The replay mechanism ensures that every architecture ultimately evaluates the same dataset.

---

# Principle 5 — Architecture Independence

## Motivation

The research investigates communication topology.

No other implementation variable should influence experimental outcomes.

---

## Design Decision

All architectures shall use identical:

- review criteria
- evaluation metrics
- PR Snapshot
- JSON schema

Prompt wording may differ only where necessary to reflect architectural responsibilities.

The only independent variable is agent communication.

---

## Experimental Variables

Controlled Variables

- model
- prompt version
- PR Snapshot
- evaluation script

Independent Variable

- communication topology

Dependent Variables

- review quality
- latency
- token usage
- execution cost
- evidence score

---

# Principle 6 — Asynchronous Execution

## Motivation

Consensus workflows may require multiple sequential LLM calls and can exceed normal HTTP request time limits.

---

## Design Decision

Experiments shall execute asynchronously.

API endpoints initiate experiments but never perform workflow execution directly.

---

## Architecture

```text
POST /api/experiments/run

        │

Create Experiment

        │

HTTP 202

        │

Background Runner

        │

Execute Workflow

        │

Store Results
```

---

## Benefits

- avoids timeout
- resumable execution
- retry support
- scalable architecture

---

# Principle 7 — Structured Outputs

## Motivation

Evaluation requires highly structured data.

Unstructured text cannot be reliably analysed.

---

## Design Decision

Every architecture must produce the same JSON schema.

The Validation Layer verifies every response before storage.

---

## Validation Pipeline

```text
LLM

↓

JSON

↓

Zod Validation

↓

Valid ?

↓

Store
```

Invalid responses trigger automatic retry.

If validation continues to fail, the experiment is marked as failed.

---

# Principle 8 — Idempotent Experiments

## Motivation

Distributed execution introduces retry behaviour.

Duplicate experiments must never generate duplicate metrics.

---

## Design Decision

Every experiment is uniquely identified by:

```
Experiment ID

=

PR Snapshot

+

Architecture

+

Model Version

+

Prompt Version
```

Repeated execution of the same experiment should either:

- return the existing result, or
- create a new version explicitly.

---

# Principle 9 — Prompt Freeze

## Motivation

Prompt optimisation during data collection introduces experimental bias.

---

## Design Decision

Before the final experiment begins, the following must be frozen:

- prompt templates
- workflow definitions
- model version
- evaluation scripts
- JSON schema

No further optimisation is permitted.

---

# Principle 10 — Evidence-Based Evaluation

## Motivation

Real pull requests rarely possess complete ground truth.

Binary labels therefore misrepresent experimental uncertainty.

---

## Design Decision

Real-world findings shall be evaluated using evidence rather than absolute correctness.

Evidence sources include:

- architecture agreement
- GitHub review comments
- future bug fixes
- static analysis
- optional human review

Synthetic datasets remain the only source for:

- Precision
- Recall
- F1-score
- Localization Accuracy

---

# Principle 11 — Extensible Architecture

## Motivation

Although this project evaluates three architectures, future work may investigate additional communication topologies.

---

## Design Decision

Review architectures shall be implemented as interchangeable plugins.

```text
Experiment Controller

        │

IReviewArchitecture

        │

├── Agentless

├── Hierarchical

├── Consensus

└── Future Architectures
```

The Experiment Controller should never depend on a specific architecture implementation.

---

# Principle 12 — Simplicity First

## Motivation

The project must be completed within five weeks.

Research quality is more important than infrastructure complexity.

---

## Design Decision

Implementation should prioritise:

- correctness
- reproducibility
- maintainability

over large-scale distributed architecture.

Infrastructure should only be introduced if it directly improves experimental reliability.

---

# Summary

The architecture defined by these principles ensures that:

- experiments remain reproducible
- production development remains isolated
- architectures are compared fairly
- outputs are machine-readable
- experiments can be replayed indefinitely
- evaluation remains scientifically defensible

These principles serve as the foundation for every implementation decision described in the remainder of this specification.