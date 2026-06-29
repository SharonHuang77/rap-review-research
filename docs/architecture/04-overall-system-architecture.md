# Part III — Software Architecture

# 4. Overall System Architecture

## 4.1 Overview

This chapter defines the logical architecture of the AI Code Review Experiment Platform.

The platform is designed as a modular experiment execution framework rather than a traditional web application.

The architecture separates experiment orchestration from review execution, allowing multiple review architectures to be evaluated using identical experimental inputs.

Every subsystem described in this specification is organised around one central component:

> **Experiment Controller**

The Experiment Controller coordinates all experiment execution while remaining independent of any specific review architecture.

---

# 4.2 Architectural Goals

The architecture has six primary goals.

### Goal 1

Execute experiments reproducibly.

---

### Goal 2

Allow multiple review architectures to evaluate identical pull request snapshots.

---

### Goal 3

Support replay of historical experiments.

---

### Goal 4

Separate experimental logic from infrastructure.

---

### Goal 5

Collect consistent evaluation metrics.

---

### Goal 6

Remain extensible for future review architectures.

---

# 4.3 Architectural Style

The platform adopts a layered modular architecture.

```text
Presentation Layer

↓

Application Layer

↓

Experiment Layer

↓

Review Layer

↓

Validation Layer

↓

Persistence Layer

↓

Evaluation Layer
```

Each layer communicates only with adjacent layers.

Business logic never depends directly on infrastructure components.

---

# 4.4 System Context

The AI Code Review Experiment Platform exists independently from the RAP Portal.

```text
                     +----------------------+
                     |      RAP Portal      |
                     |  (Source Repository) |
                     +----------+-----------+
                                |
                         Pull Requests
                                |
                                v
          +---------------------------------------+
          | AI Code Review Experiment Platform     |
          +---------------------------------------+
                                |
                +---------------+---------------+
                |                               |
        Experiment Results             Research Dataset
                |                               |
                +---------------+---------------+
                                |
                           Dashboard / CSV
```

The RAP Portal is treated purely as a source of pull request data.

No production services depend upon the research platform.

---

# 4.5 High-Level Component Architecture

The platform consists of eight major components.

```text
                  PR Import Engine
                         │
                         ▼
                Experiment Controller
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
 Agentless        Hierarchical        Consensus
     │                   │                   │
     └───────────────────┼───────────────────┘
                         ▼
                Validation Layer
                         ▼
                 Storage Layer
                         ▼
                Evaluation Engine
                         ▼
              Dashboard / CSV Export
```

The Experiment Controller is responsible for coordinating every experiment.

---

# 4.6 Component Responsibilities

| Component | Responsibility |
|------------|----------------|
| PR Import Engine | Import and snapshot pull requests |
| Experiment Controller | Orchestrate experiment execution |
| Review Architecture | Execute code review workflow |
| Validation Layer | Validate structured outputs |
| Storage Layer | Persist experimental data |
| Evaluation Engine | Compute research metrics |
| Dashboard | Visualise experiment results |
| Export Service | Produce research datasets |

Each component has a single responsibility.

---

# 4.7 Experiment Controller

The Experiment Controller is the core subsystem of the platform.

Its responsibilities include:

- creating experiments
- loading PR snapshots
- selecting review architecture
- invoking workflow execution
- collecting execution metadata
- recording failures
- initiating evaluation
- exporting experiment status

Importantly, the Experiment Controller **does not perform code review**.

Instead, it delegates review execution to a selected architecture.

```text
Experiment

↓

Experiment Controller

↓

Selected Architecture

↓

Review Results
```

This separation allows new architectures to be introduced without modifying experiment orchestration.

---

# 4.8 Review Architecture Interface

Every review architecture implements the same abstract interface.

```typescript
interface IReviewArchitecture {

    execute(
        experiment: Experiment
    ): Promise<ReviewResult>;

}
```

Current implementations include:

- Agentless
- Hierarchical
- Consensus

Future implementations may include:

- Debate-based Review
- Tree-of-Thought Review
- Self-Reflection Review

The Experiment Controller depends only on this interface.

---

# 4.9 Layer Responsibilities

## Presentation Layer

Responsibilities

- dashboard
- experiment management
- result visualisation

---

## Application Layer

Responsibilities

- REST APIs
- authentication
- request validation

---

## Experiment Layer

Responsibilities

- orchestration
- scheduling
- replay
- versioning

---

## Review Layer

Responsibilities

- execute LLM workflows
- collect findings

---

## Validation Layer

Responsibilities

- JSON parsing
- schema validation
- retry handling

---

## Persistence Layer

Responsibilities

- experiment storage
- findings
- metrics
- snapshots

---

## Evaluation Layer

Responsibilities

- precision
- recall
- evidence score
- latency
- token cost

---

# 4.10 Data Flow

Every experiment follows the same execution pipeline.

```text
Import Pull Request

↓

Create Snapshot

↓

Create Experiment

↓

Select Architecture

↓

Execute Workflow

↓

Validate Output

↓

Store Findings

↓

Compute Metrics

↓

Export Dataset
```

This pipeline is identical regardless of review architecture.

---

# 4.11 Experiment State Machine

Experiments progress through a fixed sequence of states.

```text
CREATED

↓

QUEUED

↓

RUNNING

↓

VALIDATING

↓

COMPLETED
```

Failure states

```text
RUNNING

↓

FAILED
```

Retry

```text
FAILED

↓

QUEUED
```

This state machine enables reliable asynchronous execution.

---

# 4.12 Plugin Architecture

Review architectures are implemented as plugins.

```text
Experiment Controller

↓

IReviewArchitecture

↓

├── Agentless

├── Hierarchical

├── Consensus

└── Future Architecture
```

The controller never contains architecture-specific logic.

Adding a fourth architecture therefore requires:

- new implementation
- registration

No controller modifications are required.

---

# 4.13 Design Decisions

## Decision 1

Experiment is the primary entity.

Reason

Supports replay and reproducibility.

---

## Decision 2

Controller delegates review.

Reason

Separates orchestration from implementation.

---

## Decision 3

Architectures are plugins.

Reason

Supports extensibility.

---

## Decision 4

Evaluation occurs after validation.

Reason

Only valid outputs should contribute to research datasets.

---

# 4.14 Non-functional Requirements

The architecture shall provide:

- reproducibility
- scalability
- maintainability
- modularity
- replayability
- fault tolerance

Performance optimisation is considered secondary to experimental correctness.

---

# 4.15 Summary

The overall architecture is centred around the Experiment Controller, which orchestrates all experiment execution while remaining independent of review architecture implementations.

This modular design ensures that:

- experiments remain reproducible
- review architectures remain interchangeable
- infrastructure remains replaceable
- future research extensions require minimal architectural changes

The following chapters describe the implementation of each subsystem in detail.