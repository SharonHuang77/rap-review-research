# 7. Application Architecture & Project Structure

## 7.1 Overview

This chapter defines the internal organization of the AI Code Review Experiment Platform.

The objective is to provide a maintainable, modular, and scalable codebase that clearly separates research logic from infrastructure concerns.

The application follows a layered architecture combined with feature-based organization.

Each layer has a clearly defined responsibility and communicates only through stable interfaces.

This chapter defines:

- repository layout
- application layers
- dependency rules
- package organization
- naming conventions
- configuration strategy

These conventions should be followed throughout the project.

---

# 7.2 Repository Overview

The platform is implemented as a standalone repository.

```
rap-review-research/
│
├── app/
├── src/
├── docs/
├── research/
├── tests/
├── scripts/
├── infrastructure/
├── public/
├── package.json
└── README.md
```

Each top-level directory has a single responsibility.

---

# 7.3 Top-Level Directory Responsibilities

| Directory | Responsibility |
|------------|----------------|
| app | Next.js App Router pages |
| src | Application source code |
| docs | Architecture documentation |
| research | Experimental datasets and exports |
| tests | Unit, integration, and experiment tests |
| scripts | Utility scripts |
| infrastructure | AWS deployment configuration |
| public | Static assets |

---

# 7.4 Source Code Organization

The source directory is organised by architectural layer.

```
src/

├── controllers/

├── services/

├── workflows/

├── architectures/

├── validation/

├── repositories/

├── models/

├── providers/

├── metrics/

├── evaluation/

├── storage/

├── prompts/

├── shared/

└── config/
```

---

# 7.5 Layer Responsibilities

## Controllers

Responsibilities

- REST endpoints
- Request validation
- Authentication
- Response formatting

Controllers contain no business logic.

---

## Services

Responsibilities

- coordinate use cases
- invoke repositories
- invoke Experiment Controller

Services implement application behaviour.

---

## Workflows

Responsibilities

Implement experiment workflows.

Examples

- Agentless Workflow
- Hierarchical Workflow
- Consensus Workflow

---

## Architectures

Responsibilities

Implement review architectures.

Each architecture implements:

```
IReviewArchitecture
```

---

## Validation

Responsibilities

- JSON parsing
- Zod validation
- Retry logic

---

## Repositories

Responsibilities

Access persistent storage.

Repositories isolate DynamoDB and S3 from the rest of the application.

---

## Models

Responsibilities

Domain entities.

Examples

- Experiment
- Finding
- Snapshot
- Metrics

Models contain business rules but no persistence logic.

---

## Providers

Responsibilities

External integrations.

Examples

- OpenAI
- Amazon Bedrock
- GitHub API

Changing providers should not affect business logic.

---

## Metrics

Responsibilities

Calculate quantitative experiment metrics.

Examples

- Precision
- Recall
- F1
- Token usage

---

## Evaluation

Responsibilities

Evidence scoring.

Comparison between architectures.

Dataset generation.

---

## Storage

Responsibilities

Large object storage.

Examples

- unified diffs
- raw outputs
- exports

---

## Prompts

Responsibilities

Version-controlled prompt templates.

```
prompts/

agentless/

hierarchical/

consensus/
```

Prompt versions should never overwrite historical prompts.

---

## Shared

Responsibilities

Utilities shared across the platform.

Examples

- logging
- helpers
- constants
- error handling

---

## Config

Responsibilities

Application configuration.

Examples

- environment variables
- model configuration
- feature flags

---

# 7.6 Next.js Application Structure

The user interface follows the App Router architecture.

```
app/

dashboard/

experiments/

snapshots/

architectures/

settings/

api/
```

The App directory contains presentation only.

Business logic resides in `src/`.

---

# 7.7 API Layer

API endpoints are organised by feature.

```
app/api/

experiments/

snapshots/

architectures/

metrics/

dashboard/
```

Each endpoint invokes a corresponding service.

Controllers never communicate directly with repositories.

---

# 7.8 Dependency Rules

Allowed dependencies

```
UI

↓

Controllers

↓

Services

↓

Experiment Controller

↓

Architectures

↓

Validation

↓

Repositories

↓

Storage
```

Forbidden dependencies

```
UI

↓

Repositories
```

```
Architecture

↓

Database
```

```
Repositories

↓

OpenAI
```

These rules ensure loose coupling.

---

# 7.9 Module Boundaries

Each module should expose only public interfaces.

Example

```
architectures/

agentless/

index.ts

review.ts

prompt.ts
```

External modules import only

```
index.ts
```

Internal implementation remains private.

---

# 7.10 Configuration Strategy

Configuration is externalised.

Examples

```
OPENAI_API_KEY

MODEL_NAME

AWS_REGION

PROMPT_VERSION
```

Configuration values should never be hardcoded.

---

# 7.11 Environment Strategy

Three environments are recommended.

```
local

↓

development

↓

research
```

Production deployment is optional.

The Research environment generates experimental datasets.

---

# 7.12 Logging

Logging is implemented centrally.

Log categories

- API
- Workflow
- Agent
- Validation
- Evaluation
- Storage

Every experiment receives a correlation identifier.

```
experimentId
```

All logs reference this identifier.

---

# 7.13 Error Handling

Errors are categorised.

| Type | Example |
|------|---------|
| Validation | Invalid JSON |
| Provider | OpenAI timeout |
| Storage | DynamoDB unavailable |
| Workflow | Agent failure |
| Evaluation | Missing metric |

Each error category has a standard recovery strategy.

---

# 7.14 Naming Conventions

Examples

```
ExperimentController

ExperimentService

ExperimentRepository

ExperimentMetrics

ExperimentSnapshot
```

Interfaces begin with

```
I
```

Example

```
IReviewArchitecture
```

---

# 7.15 Coding Standards

Recommended

- TypeScript strict mode
- ESLint
- Prettier
- Conventional commits
- Husky pre-commit hooks

Every pull request should pass automated validation before merge.

---

# 7.16 Testing Strategy

Testing is organised by layer.

```
tests/

unit/

integration/

architecture/

evaluation/
```

Each architecture should have independent test suites.

---

# 7.17 Documentation

Every major component requires:

- README
- sequence diagram
- interface definition
- examples

Architecture documentation remains synchronized with implementation.

---

# 7.18 Summary

The project structure follows a layered, modular architecture that separates presentation, orchestration, domain logic, infrastructure, and evaluation.

By enforcing strict dependency rules and clearly defined module responsibilities, the platform remains maintainable, testable, and extensible throughout the research project.

The next chapter introduces the deployment architecture and explains how these logical components are mapped onto AWS infrastructure.