# 5. Core Component Architecture

## 5.1 Overview

This chapter defines the internal component architecture of the AI Code Review Experiment Platform.

Where Chapter 4 described the overall logical architecture, this chapter specifies the responsibilities, interfaces, and interactions of the platform's core components.

The platform follows a modular component-based architecture in which each subsystem has a single responsibility and communicates through well-defined interfaces.

The central coordinating component is the **Experiment Controller**.

```text
                 Experiment Controller
                          │
 ┌──────────────┬──────────────┬──────────────┐
 │              │              │              │
 │        PR Import Engine     │              │
 │              │              │              │
 ▼              ▼              ▼              ▼
Agentless   Hierarchical   Consensus   Replay Engine
        │         │            │
        └─────────┴────────────┘
                  │
           Validation Layer
                  │
             Storage Layer
                  │
           Evaluation Engine
                  │
        Dashboard / CSV Export
```

---

# 5.2 Component Design Principles

Every component follows the same design principles.

- Single Responsibility
- Loose Coupling
- High Cohesion
- Interface-Based Communication
- Stateless Execution (where possible)
- Idempotent Operations
- Immutable Experimental Data

Each component should perform one task exceptionally well.

---

# 5.3 PR Import Engine

## Objective

Convert external pull requests into immutable PR Snapshots.

---

### Responsibilities

- Import GitHub Pull Requests
- Upload `.diff` files
- Parse metadata
- Store raw diff
- Create PR Snapshot

---

### Inputs

- GitHub PR URL
- GitHub Webhook (future)
- Uploaded `.diff`
- Local Git repository (optional)

---

### Outputs

```
PR Snapshot
```

---

### Dependencies

None.

The PR Import Engine is intentionally isolated from the review architectures.

---

# 5.4 Experiment Controller

The Experiment Controller is the core orchestrator of the platform.

It is responsible for coordinating the complete lifecycle of every experiment.

Responsibilities include:

- create experiment
- schedule execution
- select architecture
- monitor execution
- trigger validation
- trigger evaluation
- update experiment state

The controller **never performs review itself**.

Instead:

```
Experiment

↓

Controller

↓

Architecture
```

---

# 5.5 Review Architectures

Every review architecture implements a common interface.

```
IReviewArchitecture
```

Current implementations:

```
Agentless

Hierarchical

Consensus
```

Future implementations:

```
Debate

Reflection

Tree-of-Thought

Swarm

AutoGen

CrewAI
```

No changes to the Experiment Controller are required when introducing a new architecture.

---

# 5.6 Validation Layer

The Validation Layer verifies every LLM response before it enters persistent storage.

Responsibilities:

- Parse JSON
- Validate schema
- Repair malformed JSON
- Retry failed responses
- Reject invalid output

Only validated findings become part of the experimental dataset.

---

# 5.7 Storage Layer

The Storage Layer provides persistent storage for all research artifacts.

It stores:

- PR Snapshots
- Experiments
- Findings
- Metrics
- Raw Agent Outputs
- Logs

Storage implementation details are intentionally abstracted from the logical architecture.

Concrete technologies (e.g., DynamoDB, PostgreSQL, S3) are described in Chapter 8.

---

# 5.8 Replay Engine

Replay is a first-class architectural capability.

Responsibilities:

- Load historical PR Snapshot
- Create new Experiment
- Select architecture
- Execute workflow
- Preserve previous experiment results

Replay never modifies historical experiments.

---

# 5.9 Evaluation Engine

The Evaluation Engine transforms raw findings into research metrics.

Responsibilities:

- Precision
- Recall
- F1 Score
- Localization Accuracy
- Evidence Score
- Token Usage
- API Cost
- Latency

It performs no LLM inference.

---

# 5.10 Export Engine

The Export Engine produces datasets suitable for analysis.

Supported formats:

- CSV
- JSON
- Markdown reports

Future:

- Parquet
- SQL dump

---

# 5.11 Dashboard

The Dashboard provides visualisation only.

It is **not** responsible for experiment execution.

Responsibilities:

- Monitor experiments
- Compare architectures
- View findings
- Export datasets
- Replay experiments

---

# 5.12 Component Dependency Rules

Allowed dependencies:

```
Dashboard

↓

Experiment Controller

↓

Review Architecture

↓

Validation

↓

Storage

↓

Evaluation
```

Forbidden:

```
Dashboard

↓

Storage
```

```
Review Architecture

↓

Database
```

```
Evaluation

↓

LLM
```

These restrictions maintain loose coupling.

---

# 5.13 Failure Isolation

Failures should remain isolated to individual components.

Example:

Validation failure

↓

Retry Validation

↓

Fail Experiment

↓

Continue other experiments

The platform should never stop processing unrelated experiments.

---

# 5.14 Component Lifecycle

```
Create Experiment

↓

Load Snapshot

↓

Run Architecture

↓

Validate

↓

Store

↓

Evaluate

↓

Export
```

Each stage produces immutable outputs.

---

# 5.15 Summary

The platform is composed of loosely coupled components centred around the Experiment Controller.

Each subsystem has a clearly defined responsibility and communicates only through stable interfaces.

This design provides:

- maintainability
- extensibility
- reproducibility
- testability
- future architecture support

The following chapter introduces the persistent data model supporting these components.