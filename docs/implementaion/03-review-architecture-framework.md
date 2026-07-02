# 03 — Review Architecture Framework

## Objective

The Review Architecture Framework defines the common execution model for all automated code review architectures supported by the AI Code Review Experiment Platform.

Rather than implementing review logic directly inside the Experiment Engine, the platform delegates review execution to interchangeable architecture modules.

This separation allows multiple communication topologies to be evaluated using identical experimental inputs while keeping the Experiment Engine independent of architecture-specific behaviour.

The framework currently supports:

* Agentless Review
* Hierarchical Authority
* Decentralized Peer Consensus

Future review architectures can be added without modifying the Experiment Engine.

---

# Role in the Platform

```text
Experiment Engine
        │
        ▼
Architecture Registry
        │
 ┌──────┴──────────────┐
 │                     │
 ▼                     ▼
Agentless      Hierarchical      Consensus
        │
        ▼
Raw Review Result
        │
        ▼
Validation Layer
```

The Review Architecture Framework is responsible only for executing review workflows.

It does not validate results or store findings.

---

# Design Goals

The framework has five design goals:

1. Standardize review execution.
2. Isolate communication topology from orchestration.
3. Allow architectures to be added as plugins.
4. Support fair experimental comparison.
5. Maximize code reuse between architectures.

---

# Architecture Interface

Every review architecture must implement the same interface.

```ts
export interface IReviewArchitecture {
    readonly name: ReviewArchitecture;

    execute(
        input: ReviewExecutionInput
    ): Promise<RawReviewResult>;
}
```

The Experiment Engine communicates only through this interface.

---

# ReviewExecutionInput

Every architecture receives exactly the same input.

```ts
export interface ReviewExecutionInput {
    experimentId: string;
    snapshot: PRSnapshot;

    modelVersion: string;
    promptVersion: string;
    workflowVersion: string;
}
```

No architecture receives additional hidden information.

This ensures a fair comparison.

---

# RawReviewResult

Architectures return unvalidated output.

```ts
export interface RawReviewResult {

    architecture: ReviewArchitecture;

    summary: string;

    rawOutput: unknown;

    findings: unknown;

    inputTokens: number;

    outputTokens: number;

    latencyMs: number;

    estimatedCostUsd: number;

    messageCount: number;

    llmCalls: number;
}
```

`llmCalls` and `messageCount` measure different things and are both recorded:

* `llmCalls` — the number of LLM provider calls made during execution (1 for
  Agentless).
* `messageCount` — the number of inter-agent messages (meaningful for the
  Hierarchical and Consensus topologies; small for single-agent Agentless).

Validation occurs after architecture execution.

---

# Architecture Registry

The framework uses an architecture registry.

```ts
export class ArchitectureRegistry {

    register(
        architecture: IReviewArchitecture
    ): void;

    get(
        name: ReviewArchitecture
    ): IReviewArchitecture;

}
```

The Experiment Engine never constructs architecture objects directly.

---

# Plugin Registration

Example:

```ts
registry.register(new AgentlessArchitecture());

registry.register(new HierarchicalArchitecture());

registry.register(new ConsensusArchitecture());
```

Future architectures can be registered without changing existing code.

---

# Architecture Lifecycle

Every architecture follows the same lifecycle.

```text
Receive ReviewExecutionInput
        ↓
Load Prompt
        ↓
Execute Workflow
        ↓
Collect Findings
        ↓
Return RawReviewResult
```

No architecture performs validation or persistence.

---

# Shared Responsibilities

All architectures must:

* review the same PR Snapshot
* use the same model version
* use the same prompt version (unless role-specific prompts are required)
* return the same JSON schema
* report latency
* report token usage
* report API cost

This guarantees experimental consistency.

---

# Architecture-Specific Responsibilities

### Agentless

* single LLM review

---

### Hierarchical

* manager agent
* specialist agents
* manager aggregation

---

### Consensus

* independent specialists
* structured discussion
* consensus generation

---

# Prompt Loading

Prompt templates are loaded by version.

Example:

```text
prompt-v1

↓

agentless.md

hierarchical-manager.md

hierarchical-backend.md

consensus-specialist.md
```

The framework should not hardcode prompts.

---

# Model Provider

Architectures should not communicate directly with OpenAI.

Instead:

```text
Architecture

↓

LLM Provider

↓

OpenAI / Bedrock
```

This allows model replacement without changing architecture code.

---

# Execution Metrics

Every architecture reports:

* latency
* input tokens
* output tokens
* API cost
* number of LLM calls
* number of inter-agent messages

These metrics are collected by the Experiment Engine.

---

# Error Handling

Possible failures include:

* model timeout
* provider error
* invalid JSON
* workflow exception

Architectures should throw typed exceptions.

The Experiment Engine decides whether retries occur.

---

# Testing Requirements

Every architecture must pass:

* interface tests
* schema tests
* replay tests
* benchmark tests

The same PR Snapshot should produce deterministic structured output when model settings are held constant.

---

# Folder Structure

```text
src/

architectures/

    agentless/

    hierarchical/

    consensus/

    registry/

    interfaces/

    shared/
```

Each architecture is self-contained.

---

# Implementation Order

1. Create interfaces.
2. Create registry.
3. Create provider abstraction.
4. Implement Agentless.
5. Implement Hierarchical.
6. Implement Consensus.

---

# Design Decisions

## Decision 1

Architectures are plugins.

Reason:

Future architectures should require no changes to the Experiment Engine.

---

## Decision 2

Architectures return raw output.

Reason:

Validation belongs to the Validation Layer.

---

## Decision 3

Architectures use the same interface.

Reason:

Ensures fair comparison and interchangeable execution.

---

## Decision 4

Provider abstraction.

Reason:

Supports OpenAI today and other providers later without rewriting architectures.

---

# Minimum Viable Implementation

Week 1 only requires:

```text
Architecture Registry
        ↓
Agentless
        ↓
Return RawReviewResult
```

Hierarchical and Consensus are implemented later without modifying the framework.

---

# Future Improvements

Future versions may support:

* Tree-of-Thought
* Debate
* Reflection
* CrewAI
* AutoGen
* Swarm architectures
* Multi-model comparison

The framework is intentionally extensible.

---

# Summary

The Review Architecture Framework provides a common execution model for all review topologies.

By separating orchestration from review execution, the platform can compare multiple architectures fairly while minimizing duplicated implementation.
