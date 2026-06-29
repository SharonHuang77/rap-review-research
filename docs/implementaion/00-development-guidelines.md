# 00 — Development Guidelines

**Project:** AI Code Review Experiment Platform

**Version:** 1.0

**Status:** Active

---

# Purpose

This document defines the engineering standards for implementing the AI Code Review Experiment Platform.

All contributors (human or AI) must read this document before implementing any module.

The purpose is to ensure that every implementation follows the same architectural principles, coding standards, and research constraints.

If this document conflicts with an implementation document, the implementation document takes precedence.

If both conflict with the Architecture Specification, the Architecture Specification takes precedence.

---

# Project Philosophy

This repository is **not** a production AI code review system.

It is a **research platform** designed to evaluate different multi-agent communication topologies for automated code review.

Every implementation decision should support one or more of the following goals:

* reproducibility
* fairness
* replayability
* maintainability
* extensibility

Do not implement features that do not improve the research platform.

---

# Repository Structure

```text
docs/
research/
scripts/
tests/
src/
```

Implementation code belongs only under

```text
src/
```

Documentation belongs only under

```text
docs/
```

Research artifacts belong only under

```text
research/
```

---

# Architecture Rules

The architecture is experiment-centric.

The execution flow is

```text
PR Snapshot

↓

Experiment Engine

↓

Review Architecture

↓

Validation

↓

Storage

↓

Evaluation

↓

Dashboard
```

Do not bypass this flow.

---

# Dependency Rules

Allowed

```text
Controller

↓

Service

↓

Experiment Engine

↓

Architecture

↓

Validation

↓

Repository

↓

Storage
```

Forbidden

Architecture

↓

Repository

Architecture

↓

Database

Architecture

↓

Dashboard

Dashboard

↓

Repository

Evaluation

↓

OpenAI

Business logic should never depend directly on infrastructure.

---

# Single Responsibility Principle

Every module should have one responsibility.

Example

Experiment Engine

Responsible for:

* executing experiments

Not responsible for:

* parsing diffs
* validating JSON
* storing findings

---

# Architecture Plugin Rule

Every review architecture must implement

```typescript
IReviewArchitecture
```

The Experiment Engine must never contain architecture-specific logic.

Adding a new review architecture should not require modifying the Experiment Engine.

---

# Experiment-Centric Design

The primary entity is

```text
Experiment
```

Everything else belongs to an experiment.

Do not build features around Pull Requests.

Build features around Experiments.

---

# Immutable Data

The following objects are immutable.

* PR Snapshot
* Findings
* Metrics
* Review Result

Experiments may update only their execution status.

Historical data must never be overwritten.

---

# Replay Support

Every implementation should assume that experiments can be replayed.

Do not implement features that permanently modify historical experiments.

Replay is a mandatory system capability.

---

# Validation

Never trust LLM output.

Every model response must pass through the Validation Engine before storage.

No module except the Validation Engine may validate JSON schemas.

---

# Storage

Business logic must never communicate directly with:

* DynamoDB
* PostgreSQL
* Amazon S3

Always use repositories.

Example

```text
Experiment Engine

↓

ExperimentRepository

↓

Database
```

---

# Provider Rule

Review architectures should never communicate directly with OpenAI.

Instead

```text
Architecture

↓

LLM Provider

↓

OpenAI
```

Changing providers should require changing only the Provider Layer.

---

# Prompt Management

Prompt templates must be version-controlled.

Never hardcode prompts.

Example

```text
prompt-v1

prompt-v2

prompt-v3
```

Prompt versions become immutable after prompt freeze.

---

# Error Handling

Throw typed exceptions.

Avoid generic exceptions.

Preferred

```typescript
ValidationError

StorageError

ProviderError

WorkflowError
```

Avoid

```typescript
throw new Error(...)
```

unless unavoidable.

---

# Logging

Every log entry should contain

* experimentId
* snapshotId
* architecture

Example

```json
{
  "experimentId":"exp123",
  "snapshotId":"snap12",
  "architecture":"agentless",
  "message":"Execution completed"
}
```

---

# Testing

Every module requires tests.

Minimum

* unit tests
* happy path
* failure path

Architectures additionally require

* schema test
* replay test

---

# TypeScript

Required

```json
strict = true
```

Avoid

```typescript
any
```

Prefer

* interfaces
* readonly
* enums or string literal unions
* discriminated unions

---

# Code Style

Maximum function length

Approximately 50 lines.

If a function exceeds 100 lines, consider refactoring.

Maximum nesting depth

Three levels.

Prefer early returns.

---

# Naming

Classes

```text
ExperimentEngine

ValidationEngine

ExperimentRepository
```

Interfaces

```text
IReviewArchitecture

ILLMProvider
```

Files

```text
experiment-engine.ts

validation-engine.ts
```

Use kebab-case for filenames.

---

# Documentation

Every exported class should include

* purpose
* responsibilities
* dependencies

Public methods require TypeScript documentation comments.

---

# Performance

Correctness is more important than performance.

Avoid premature optimization.

Only optimize after measurements demonstrate a bottleneck.

---

# AI Coding Rules

When implementing a module:

1. Read this document.
2. Read the corresponding implementation document.
3. Do not modify unrelated modules.
4. Preserve public interfaces.
5. Follow dependency rules.
6. Add tests.
7. Keep implementations simple.

---

# Pull Request Rules

Each Pull Request should implement one feature only.

Examples

Good

* Implement Validation Engine

Bad

* Validation + Dashboard + Storage

Small pull requests are easier to review and test.

---

# Research Constraints

Do not introduce experimental bias.

Never modify:

* prompts
* workflows
* evaluation logic

after the Prompt Freeze milestone.

If changes are necessary, increment the version number.

---

# Future-Proofing

When implementing code, ask:

> Will adding a fourth review architecture require changes?

If the answer is yes, redesign the implementation.

The platform should support future architectures without modification to the Experiment Engine.

---

# Definition of Done

A module is complete only if:

* implementation matches documentation
* tests pass
* interfaces are documented
* no architectural rules are violated
* implementation is committed with documentation updates

---

# AI Agent Prompt

Every AI coding agent should begin with the following instruction.

---

You are contributing to the AI Code Review Experiment Platform.

Before writing code:

1. Read `docs/implementation/00-development-guidelines.md`.
2. Read the relevant implementation specification.
3. Follow the architecture exactly.
4. Do not introduce new architectural patterns.
5. Keep changes limited to the requested module.
6. Add tests.
7. Explain any architectural deviations before implementing them.

The objective is to build a maintainable research platform, not merely produce working code.

## Tooling Standards

The project uses native TypeScript execution through Node.js type stripping.

TypeScript files are executed directly by Node. The TypeScript compiler is used only for type checking and does not emit JavaScript.

### Execution Model

The project does **not** use:

* Jest
* Babel
* Webpack
* Vite
* Rollup
* a `dist/` build output
* precompiled JavaScript for local execution

Instead:

```bash
node scripts/demo-experiment-engine.ts
node --test "tests/unit/**/*.test.ts"
```

Node loads `.ts` files directly and erases type annotations at runtime.

### Type Checking

Type checking is performed with:

```bash
tsc -p tsconfig.json
```

The TypeScript configuration uses:

```json
{
  "noEmit": true,
  "erasableSyntaxOnly": true
}
```

`noEmit` ensures TypeScript produces no JavaScript output.

`erasableSyntaxOnly` ensures the code remains compatible with Node's native TypeScript type stripping.

This means the following TypeScript features should not be used:

* `enum`
* `namespace`
* constructor parameter properties

Use string-literal unions instead of enums.

Preferred:

```ts
export type ExperimentStatus =
  | "created"
  | "queued"
  | "running"
  | "completed"
  | "failed";
```

Avoid:

```ts
enum ExperimentStatus {
  Created,
  Queued,
  Running,
  Completed,
  Failed
}
```

### Testing

The project uses Node's built-in test runner:

```bash
node --test
```

The default test command is:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

### Standard Scripts

```json
{
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "node --test \"tests/unit/**/*.test.ts\"",
    "test:watch": "node --test --watch \"tests/unit/**/*.test.ts\"",
    "demo": "node scripts/demo-experiment-engine.ts",
    "check": "npm run typecheck && npm test"
  }
}
```

### Development Workflow

Developers should run:

```bash
npm run check
```

before committing.

To verify the Experiment Engine manually, run:

```bash
npm run demo
```

### Node Version

The project requires:

```text
Node >= 22.18
```

Development currently uses Node 25.

### Rationale

This tooling strategy keeps the project lightweight and reproducible.

It avoids unnecessary bundlers, transpilers, and test frameworks while still enforcing strict type safety.

If future deployment requirements require emitted JavaScript, a separate build target may be introduced later. Until then, the project should remain native-execution-first.
