# 04 — Agentless Review Architecture

**Module:** Agentless Review Architecture

**Status:** Ready for Implementation

**Owner:** Research Platform Team

**Dependencies:**

* Experiment Engine
* Review Architecture Framework
* LLM Provider
* Prompt Manager

---

# 1. Purpose

The Agentless Review Architecture is the baseline implementation for the AI Code Review Experiment Platform.

It performs an automated review of a Pull Request Snapshot using **a single Large Language Model invocation** without collaboration, planning, or communication between multiple agents.

Its purpose is to establish the experimental baseline against which the Hierarchical and Consensus architectures will be evaluated.

The implementation should prioritize simplicity, determinism, and reproducibility over sophistication.

---

# 2. Research Role

This module represents the **control group** in the experiment.

It answers the following research question:

> How well can a single LLM review a pull request without any multi-agent coordination?

Its output will later be compared against:

* Hierarchical Authority
* Decentralized Peer Consensus

using identical PR Snapshots and evaluation metrics.

---

# 3. Responsibilities

The Agentless Architecture is responsible for:

* loading a PR Snapshot
* constructing the review prompt
* invoking the configured LLM
* collecting execution metrics
* returning a `RawReviewResult`

It must not:

* validate JSON
* retry requests
* store findings
* compute evaluation metrics
* access repositories directly

---

# 4. Architecture

```text
Experiment Engine
        │
        ▼
Agentless Architecture
        │
        ▼
Prompt Manager
        │
        ▼
LLM Provider
        │
        ▼
OpenAI
        │
        ▼
Raw JSON
        │
        ▼
RawReviewResult
```

The Agentless Architecture is intentionally stateless.

---

# 5. Execution Workflow

```text
Load PR Snapshot
        │
        ▼
Load Prompt Template
        │
        ▼
Construct Prompt
        │
        ▼
Call LLM Provider
        │
        ▼
Receive Raw JSON
        │
        ▼
Measure Tokens
        │
        ▼
Measure Cost
        │
        ▼
Return RawReviewResult
```

Exactly **one** LLM request should occur.

---

# 6. Sequence Diagram

```text
Experiment Engine
      │
      │ execute()
      ▼
Agentless Architecture
      │
      │ loadPrompt()
      ▼
Prompt Manager
      │
      │ prompt
      ▼
Agentless Architecture
      │
      │ review()
      ▼
LLM Provider
      │
      │ API Request
      ▼
OpenAI
      │
      │ JSON
      ▼
LLM Provider
      │
      ▼
Agentless Architecture
      │
      ▼
RawReviewResult
```

---

# 7. Component Design

The Agentless module consists of four classes.

```text
agentless/

├── agentless-architecture.ts
├── prompt-builder.ts
├── prompt-loader.ts
└── mapper.ts
```

## AgentlessArchitecture

Responsible for:

* orchestration
* timing
* metric collection

---

## PromptLoader

Responsible for:

* locating prompt versions
* loading markdown prompt templates

---

## PromptBuilder

Responsible for:

* combining prompt template with PR Snapshot
* formatting context

---

## Mapper

Responsible for:

* converting provider responses into `RawReviewResult`

---

# 8. Public Interface

```typescript
export class AgentlessArchitecture
    implements IReviewArchitecture {

    readonly name = "agentless";

    async execute(
        input: ReviewExecutionInput
    ): Promise<RawReviewResult>;

}
```

The interface must match all future architectures.

---

# 9. Prompt Construction

The final prompt should contain:

1. System Prompt
2. Review Instructions
3. Coding Standards
4. PR Metadata
5. Unified Diff
6. Expected JSON Schema

The prompt builder should assemble these sections dynamically.

Prompt templates must not be hardcoded.

---

# 10. Provider Interaction

The Agentless Architecture communicates only with the `ILLMProvider`.

```text
Agentless
        │
        ▼
ILLMProvider
        │
        ▼
OpenAI
```

Future providers (e.g., Amazon Bedrock, Anthropic) should be interchangeable.

---

# 11. Expected Output

The model must return JSON matching the project schema.

Example:

```json
{
  "summary": "...",
  "riskLevel": "medium",
  "findings": [
    {
      "title": "...",
      "severity": "high",
      "category": "security",
      "file": "src/api/auth.ts",
      "line": 52,
      "description": "...",
      "recommendation": "...",
      "confidence": 0.91
    }
  ]
}
```

The Agentless module **must not validate** this structure.

---

# 12. RawReviewResult

```typescript
export interface RawReviewResult {

    architecture: "agentless";

    summary: string;

    rawOutput: unknown;

    inputTokens: number;

    outputTokens: number;

    estimatedCostUsd: number;

    latencyMs: number;

    llmCalls: number;

}
```

For Agentless:

```
llmCalls = 1
```

---

# 13. Error Handling

The module should propagate errors to the Experiment Engine.

Supported errors:

* ProviderTimeoutError
* ProviderAuthenticationError
* ProviderRateLimitError
* ProviderResponseError

No retry logic exists inside Agentless.

---

# 14. Metrics

The Agentless module records:

* total latency
* input tokens
* output tokens
* API cost
* number of LLM calls

These metrics are attached to `RawReviewResult`.

---

# 15. Logging

Every execution should log:

* experimentId
* snapshotId
* architecture
* modelVersion
* promptVersion
* latency
* token usage

The logger should never include API keys or full prompts.

---

# 16. Testing Strategy

Unit tests should verify:

* prompt loading
* prompt construction
* provider invocation
* successful execution
* provider failure propagation
* metrics collection

Mock the provider during testing.

No real API calls should occur.

---

# 17. Performance Expectations

Expected characteristics:

| Metric                | Expected |
| --------------------- | -------- |
| LLM Calls             | 1        |
| Latency               | Lowest   |
| Cost                  | Lowest   |
| Coordination Overhead | None     |

This architecture serves as the efficiency baseline.

---

# 18. Acceptance Criteria

The implementation is complete when:

* [ ] Implements `IReviewArchitecture`
* [ ] Uses the Prompt Manager
* [ ] Uses the `ILLMProvider`
* [ ] Makes exactly one LLM call
* [ ] Returns `RawReviewResult`
* [ ] Records latency
* [ ] Records token usage
* [ ] Records API cost
* [ ] Does not access repositories
* [ ] Does not validate JSON
* [ ] Unit tests pass

---

# 19. AI Implementation Checklist

Before submitting code, verify:

* [ ] Read `00-development-guidelines.md`
* [ ] Public interface matches specification
* [ ] No direct OpenAI SDK usage
* [ ] No hardcoded prompts
* [ ] No retry logic
* [ ] No database access
* [ ] No TODO placeholders
* [ ] Tests included
* [ ] Documentation updated if implementation changed

---

# 20. Future Improvements

Potential future enhancements include:

* streaming responses
* prompt optimization
* response caching
* reasoning model support
* provider failover

These enhancements should be implemented in new versions without changing the baseline experiment after the prompt freeze.

---

# Summary

The Agentless Review Architecture is the simplest review topology supported by the platform. It provides the experimental baseline against which all multi-agent communication architectures are compared.

Its implementation should remain intentionally simple, deterministic, and isolated from validation, storage, and evaluation concerns.
