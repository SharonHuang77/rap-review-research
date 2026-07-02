# 04 — Agentless Review Architecture

**Module:** Agentless Review Architecture
**Status:** Ready for Implementation
**Dependencies:** RFC-01 Experiment Engine, RFC-03 Review Architecture Framework, RFC-03.5 LLM Architecture

---

## 1. Purpose

The Agentless Review Architecture is the first real review architecture in the AI Code Review Experiment Platform.

It reviews one immutable PR Snapshot using a single LLM provider call. It does not use multiple agents, manager coordination, discussion rounds, or consensus. This makes it the baseline against which Hierarchical Authority and Decentralized Peer Consensus will be compared.

---

## 2. Research Role

Agentless is the control condition.

It answers:

> How well can a single LLM review a pull request without multi-agent communication?

This architecture is expected to have the lowest latency, lowest token usage, and lowest coordination overhead.

---

## 3. Responsibilities

Agentless is responsible for:

* receiving `ReviewExecutionInput`
* building an LLM review request from the PR Snapshot
* using the shared Prompt Builder
* calling `ILLMProvider` exactly once
* mapping the provider response into `RawReviewResult`
* reporting latency, tokens, estimated cost, and `llmCalls = 1`

Agentless is not responsible for:

* validating JSON
* storing findings
* computing precision, recall, or evidence scores
* retrying provider failures
* calling Bedrock directly
* accessing repositories directly

---

## 4. Architecture

```text
Experiment Engine
        ↓
Architecture Registry
        ↓
AgentlessArchitecture
        ↓
PromptBuilder
        ↓
ILLMProvider
        ↓
MockProvider / BedrockProvider
        ↓
RawReviewResult
```

Agentless must depend only on `ILLMProvider`, not on Bedrock-specific code.

---

## 5. Execution Workflow

```text
1. Experiment Engine calls AgentlessArchitecture.execute(input)
2. Agentless receives ReviewExecutionInput
3. Agentless builds prompt context from PR Snapshot
4. PromptBuilder creates LLMReviewRequest
5. Agentless calls ILLMProvider.review(request)
6. Provider returns LLMReviewResponse
7. Agentless maps response to RawReviewResult
8. RawReviewResult returns to Experiment Engine
```

Exactly one provider call should occur.

---

## 6. Public Interface

```ts
export class AgentlessArchitecture implements IReviewArchitecture {
  readonly name = "agentless";

  async execute(input: ReviewExecutionInput): Promise<RawReviewResult> {
    // implementation
  }
}
```

---

## 7. Input Contract

Agentless receives:

```ts
export interface ReviewExecutionInput {
  experimentId: string;
  snapshot: PRSnapshot;
  modelVersion: string;
  promptVersion: string;
  workflowVersion: string;
}
```

It must use the unified `PRSnapshot` model from RFC-02.

---

## 8. Output Contract

Agentless returns `RawReviewResult`.

```ts
export interface RawReviewResult {
  architecture: "agentless";
  summary: string;
  findings: unknown;
  rawOutput: unknown;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  messageCount: number;
  llmCalls: number;
}
```

For Agentless:

```text
llmCalls = 1
```

`messageCount` (inter-agent messages) is part of the shared `RawReviewResult`
and is also recorded; for single-agent Agentless it is small (1).

---

## 9. Prompt Requirements

Agentless must use the shared prompt infrastructure from RFC-03.5.

Prompt composition should include:

* common review instructions
* Agentless role instruction
* PR metadata
* changed files summary
* unified diff
* expected JSON output shape

Prompt templates should live under the versioned prompt directory, for example:

```text
src/llm/prompts/templates/v1/common/
src/llm/prompts/templates/v1/agentless/
```

Do not hardcode prompts inside `AgentlessArchitecture`.

---

## 10. Expected Model Output

The provider response text should be JSON-shaped and compatible with the future Validation Engine.

Example:

```json
{
  "summary": "The PR introduces one high-risk authorization issue.",
  "riskLevel": "high",
  "findings": [
    {
      "title": "Missing authorization check",
      "severity": "high",
      "category": "security",
      "file": "src/api/reports.ts",
      "line": 42,
      "description": "The endpoint updates a report without verifying that the authenticated user belongs to the report's company.",
      "recommendation": "Check report ownership before allowing the update.",
      "confidence": 0.91
    }
  ]
}
```

Agentless should not validate this output. Validation belongs to RFC-05.

---

## 11. Suggested Folder Structure

```text
src/architectures/agentless/
  agentless-architecture.ts
  agentless-result-mapper.ts
  index.ts
  README.md
```

Prompt files should remain in `src/llm/prompts/`, not inside `src/architectures/agentless/`.

---

## 12. Error Handling

Agentless should propagate typed provider errors from the LLM layer.

Examples:

* `ProviderAuthenticationError`
* `ProviderTimeoutError`
* `ProviderRateLimitError`
* `ProviderResponseError`

Agentless should not retry internally. Retry policy belongs to the Experiment Engine.

---

## 13. Logging

Each execution should log:

* `experimentId`
* `snapshotId`
* `architecture`
* `modelVersion`
* `promptVersion`
* `latencyMs`
* `inputTokens`
* `outputTokens`
* `estimatedCostUsd`

Do not log AWS credentials, full prompts, or secrets.

---

## 14. Testing Requirements

Unit tests should verify:

* Agentless implements `IReviewArchitecture`
* it calls `ILLMProvider.review()` exactly once
* it uses `PromptBuilder`
* it maps provider response into `RawReviewResult`
* `llmCalls` is always `1`
* provider errors are propagated
* no direct repository access occurs
* no Bedrock calls occur in tests

Use `MockProvider` for tests.

---

## 15. Demo Requirement

Add a local demo script:

```text
npm run demo:agentless
```

The demo should run:

```text
sample.diff
  ↓
PR Import Engine
  ↓
PR Snapshot
  ↓
Experiment Engine
  ↓
Architecture Registry
  ↓
AgentlessArchitecture
  ↓
MockProvider
  ↓
RawReviewResult
```

The demo should not require real Bedrock credentials by default.

A separate live Bedrock smoke test may exist, but should not run automatically.

---

## 16. Acceptance Criteria

* [ ] `AgentlessArchitecture` implements `IReviewArchitecture`
* [ ] Uses shared PromptBuilder
* [ ] Uses `ILLMProvider`
* [ ] Makes exactly one provider call
* [ ] Returns `RawReviewResult`
* [ ] Reports latency
* [ ] Reports input tokens
* [ ] Reports output tokens
* [ ] Reports estimated cost
* [ ] Sets `llmCalls = 1`
* [ ] Does not validate JSON
* [ ] Does not access repositories
* [ ] Does not call Bedrock directly
* [ ] Uses mock provider in tests
* [ ] `npm run check` passes
* [ ] `npm run demo:agentless` works

---

## 17. AI Implementation Checklist

Before submitting this RFC, verify:

* [ ] Read `00-development-guidelines.md`
* [ ] Read `03-review-architecture-framework.md`
* [ ] Read `03.5-llm-architecture.md`
* [ ] No architecture-specific logic added to Experiment Engine
* [ ] No provider-specific logic added to Agentless
* [ ] No direct AWS SDK usage in Agentless
* [ ] No hardcoded prompts
* [ ] No TODO placeholders
* [ ] Tests included
* [ ] README added or updated

---

## 18. Out of Scope

Do not implement:

* Validation Engine
* Storage Engine
* Evaluation Engine
* Dashboard
* Hierarchical Architecture
* Consensus Architecture
* AWS deployment

---

## 19. Future Improvements

Future versions may add:

* live Bedrock demo
* prompt A/B testing
* response caching
* structured output enforcement
* model comparison
* replay-based batch runs

Do not add these until the baseline Agentless architecture is complete.

---

## Summary

Agentless is the first real review architecture and the baseline condition for the research experiment.

It must remain simple: one PR Snapshot, one prompt, one LLM provider call, one raw result.
