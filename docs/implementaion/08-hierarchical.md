# 08 — Hierarchical Authority Review Architecture

**Module:** Hierarchical Authority Review Architecture

**Status:** Ready for Implementation

**Dependencies:**

- RFC-01 Experiment Engine
- RFC-03 Review Architecture Framework
- RFC-03.5 Shared LLM Architecture
- RFC-05 Validation Engine
- RFC-06 Storage Engine
- RFC-07 Research Evaluation Engine

---

# 1. Purpose

The Hierarchical Authority Review Architecture is the first multi-agent review topology implemented by the platform.

Unlike Agentless, which performs one review using a single LLM call, the Hierarchical architecture distributes review responsibilities across multiple specialized agents coordinated by a Manager Agent.

The objective is to determine whether hierarchical task decomposition produces higher-quality code reviews than a single general-purpose reviewer.

---

# 2. Research Motivation

Modern software systems contain multiple technical domains.

A single reviewer must reason about:

- frontend
- backend
- database
- API contracts
- security
- performance
- architecture

Human engineering teams frequently distribute these responsibilities among specialists.

The Hierarchical Authority architecture investigates whether a similar decomposition improves LLM-based review quality.

Research Question:

> Does a manager coordinating specialized reviewers outperform a single LLM reviewer?

---

# 3. Design Principles

The architecture follows these principles:

- specialization
- centralized coordination
- deterministic workflow
- independent reviewers
- single synthesis stage
- reproducible execution

---

# 4. Architecture

```
                    Manager Agent
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
      ▼                   ▼                   ▼
 Backend Reviewer   Frontend Reviewer   Database Reviewer
      │                   │                   │
      └───────────────────┼───────────────────┘
                          │
                          ▼
                 Result Synthesizer
                          │
                          ▼
                  RawReviewResult
```

The Manager Agent owns the workflow.

Specialists never communicate directly with one another.

---

# 5. Responsibilities

## Manager Agent

Responsible for:

- creating review plan
- assigning work
- collecting responses
- resolving duplicate findings
- producing final review

Not responsible for:

- detailed code analysis
- validation
- storage
- evaluation

---

## Specialist Agents

Each specialist is responsible only for its assigned domain.

Examples:

### Backend Reviewer

Focuses on:

- APIs
- business logic
- authorization
- authentication
- validation
- concurrency

---

### Frontend Reviewer

Focuses on:

- React components
- UX
- accessibility
- state management
- rendering
- client performance

---

### Database Reviewer

Focuses on:

- SQL
- schema changes
- indexes
- migrations
- transactions
- consistency

Future specialists may include:

- Security Reviewer
- Infrastructure Reviewer
- Performance Reviewer

without modifying the Manager Agent.

---

# 6. Execution Workflow

```
Experiment Engine
        │
        ▼
Hierarchical Architecture
        │
        ▼
Manager Agent
        │
        ▼
Create Review Plan
        │
        ▼
Dispatch Specialists
        │
        ▼
Collect Reviews
        │
        ▼
Merge Findings
        │
        ▼
Generate Summary
        │
        ▼
RawReviewResult
```

---

# 7. Communication Model

Communication follows a strict hierarchy.

```
Manager

↓

Specialist

↓

Manager
```

Peer-to-peer communication is prohibited.

This topology isolates the effects of centralized coordination.

RFC-09 (Consensus) will intentionally remove this restriction.

---

# 8. Agent Roles

Each specialist receives:

- identical PR Snapshot
- identical coding guidelines
- identical JSON schema

The only difference is its role description.

Example:

Backend Reviewer:

> Review only backend implementation details.
Ignore frontend styling and database optimization unless they directly affect backend correctness.

Frontend Reviewer:

> Review only frontend implementation details.
Ignore backend implementation unless required to explain a frontend issue.

This ensures role specialization while maintaining prompt consistency.

---

# 9. Prompt Composition

Every specialist prompt is composed from:

Common Instructions

+

Role Instructions

+

PR Snapshot

+

Expected JSON Schema

Prompt composition continues to use the shared PromptBuilder from RFC-03.5.

No prompts are hardcoded.

---

# 10. Manager Workflow

The Manager performs five stages.

## Stage 1

Analyze PR metadata.

Determine:

- changed files
- affected technologies
- required specialists

---

## Stage 2

Create Review Plan.

Example:

```
Backend Reviewer

↓

Frontend Reviewer

↓

Database Reviewer
```

The initial implementation may always invoke all three specialists.

Future versions may dynamically skip irrelevant specialists.

---

## Stage 3

Dispatch Reviews.

Each specialist reviews independently.

No specialist receives another specialist's findings.

---

## Stage 4

Collect Findings.

Manager gathers:

- findings
- summaries
- confidence

No modification occurs yet.

---

## Stage 5

Merge Findings.

The Manager:

- removes duplicates
- resolves conflicts
- generates final summary
- returns RawReviewResult

---

# 11. Agent Messages

All communication should use strongly typed messages.

```ts
export interface AgentMessage {

    from: AgentRole;

    to: AgentRole;

    type: AgentMessageType;

    content: unknown;

    timestamp: string;

}
```

Do not pass raw strings between agents.

This improves replayability and future visualization.

---

# 12. Conversation History

Each execution maintains a structured conversation.

```ts
export interface ConversationHistory {

    messages: AgentMessage[];

}
```

Conversation history becomes an experiment artifact.

It may later be visualized in the Dashboard.

---

# 13. Review Plan

The Manager creates a ReviewPlan before dispatch.

```ts
export interface ReviewPlan {

    experimentId: string;

    specialists: AgentRole[];

}
```

# 13.1 Review Planner

The Manager should not construct review plans directly.

Planning should be delegated to a dedicated planner interface.

```ts
export interface IReviewPlanner {
  createPlan(input: ReviewExecutionInput): ReviewPlan;
}
```

`createPlan` takes the full `ReviewExecutionInput` (not just `PRSnapshot`)
because `ReviewPlan.experimentId` requires the experiment id, which lives on the
input rather than the snapshot.

Future versions may include:

- execution priority
- estimated token budget
- conditional reviewers

without changing specialist implementations.

---

# 14. Manager State Machine

The Manager Agent should be implemented as a deterministic state machine.

```
Created
    │
    ▼
Planning
    │
    ▼
Dispatching
    │
    ▼
Collecting
    │
    ▼
Synthesizing
    │
    ▼
Completed
```

If any specialist fails:

```
Created
    │
Planning
    │
Dispatching
    │
Specialist Failure
    │
    ▼
Failed
```

The Manager owns all state transitions.

Specialists are stateless workers.

---

# 15. Result Synthesis

After all specialist reviews complete, the Manager synthesizes the final review.

Responsibilities:

- merge findings
- remove duplicates
- resolve conflicting severities
- produce unified summary
- calculate aggregate metadata

The synthesis stage should not perform another full code review.

It operates only on specialist outputs.

---

# 16. Duplicate Resolution

Duplicate findings are expected.

Duplicates are identified using:

- file
- line
- title

When duplicates occur:

- preserve the highest severity
- preserve the highest confidence
- merge supporting evidence where possible

The Manager should record how many duplicates were removed.

---

# 17. Conflict Resolution

Specialists may disagree.

Example:

Backend Reviewer

```
Severity = High
```

Database Reviewer

```
Severity = Medium
```

The initial implementation should use deterministic rules.

Example:

- highest severity wins
- highest confidence wins

Future versions may allow an LLM-based synthesis step.

---

# 18. HierarchicalReviewResult

```ts
export interface HierarchicalReviewResult {

    managerSummary: string;

    specialistResults: SpecialistReviewResult[];

    mergedFindings: ReviewFinding[];

    duplicateCount: number;

}
```

This structure exists before conversion into RawReviewResult.

---

# 19. SpecialistReviewResult

```ts
export interface SpecialistReviewResult {

    role: AgentRole;

    summary: string;

    findings: ReviewFinding[];

    latencyMs: number;

    inputTokens: number;

    outputTokens: number;

    estimatedCostUsd: number;

}
```

These objects should be preserved for future replay and visualization.

`estimatedCostUsd` is included because the LLM provider returns it per call, so
summing the specialists' actual costs is more accurate than re-deriving cost
from token counts.

---

# 20. Agent Roles

Define a strongly typed role model.

```ts
export type AgentRole =

    | "manager"

    | "backend"

    | "frontend"

    | "database";
```

Future RFCs may extend this union.

---

# 21. Agent Message Types

```ts
export type AgentMessageType =

    | "review-request"

    | "review-response"

    | "merge-request"

    | "merge-response";
```

This prepares the platform for richer communication models in RFC-09.

---

# 22. Metrics

Hierarchical introduces new metrics.

```ts
export interface HierarchicalMetrics {

    specialistCount: number;

    llmCalls: number;

    messageCount: number;

    duplicateCount: number;

    mergeLatencyMs: number;

}
```

Unlike Agentless:

```
Agentless

llmCalls = 1

messageCount = 1
```

Hierarchical will typically produce:

```
llmCalls > 1

messageCount > 1
```

These metrics are consumed by RFC-07 Evaluation Engine.

---

# 23. LLM Orchestration

Each specialist should invoke the shared LLM layer independently.

```
Backend

↓

Prompt Builder

↓

ILLMProvider

↓

LLM
```

The Manager should never communicate directly with Bedrock.

All LLM calls continue to pass through RFC-03.5.

---

# 24. Failure Handling

Possible failures:

- specialist timeout
- provider error
- invalid response
- synthesis failure

The Manager should decide whether to:

- fail the experiment
- continue with partial results

The initial implementation should fail fast.

Future versions may support degraded execution.

---

# 25. Storage

RFC-06 Storage Engine should preserve:

- ReviewPlan
- ConversationHistory
- SpecialistReviewResults
- HierarchicalMetrics

These become additional experiment artifacts.

The review architecture itself must not access storage directly.

---

# 26. Evaluation

RFC-07 Evaluation Engine should evaluate Hierarchical using exactly the same metrics as Agentless.

Additional metrics include:

- specialist count
- duplicate count
- merge latency

This ensures fair comparison.

---

# 27. Folder Structure

```
src/

architectures/

    hierarchical/

        hierarchical-architecture.ts

        manager-agent.ts

        backend-reviewer.ts

        frontend-reviewer.ts

        database-reviewer.ts

        synthesizer.ts

        review-plan.ts

        conversation-history.ts

        messages.ts

        models/

            hierarchical-review-result.ts

            specialist-review-result.ts

        README.md
```

---

# 28. Testing

## Unit Tests

Verify:

- ReviewPlan generation
- Manager state transitions
- specialist invocation
- duplicate removal
- conflict resolution
- synthesis
- typed messages
- conversation history

---

## Integration Tests

```
sample.diff

↓

PR Import

↓

Experiment Engine

↓

Hierarchical

↓

Validation

↓

Storage

↓

Evaluation
```

Verify:

- manager orchestrates specialists
- specialist outputs preserved
- final review generated
- metrics recorded

MockProvider should be used.

No Bedrock calls.

---

# 29. Acceptance Criteria

- [ ] HierarchicalArchitecture implemented
- [ ] Manager Agent implemented
- [ ] Backend Reviewer implemented
- [ ] Frontend Reviewer implemented
- [ ] Database Reviewer implemented
- [ ] ReviewPlan implemented
- [ ] AgentMessage implemented
- [ ] ConversationHistory implemented
- [ ] HierarchicalReviewResult implemented
- [ ] SpecialistReviewResult implemented
- [ ] Duplicate resolution implemented
- [ ] Conflict resolution implemented
- [ ] Manager state machine implemented
- [ ] Hierarchical metrics implemented
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] npm run check passes

---

# 30. AI Implementation Checklist

Before submitting:

- [ ] Read RFC-03 Review Framework
- [ ] Read RFC-03.5 LLM Architecture
- [ ] Read RFC-05 Validation Engine
- [ ] Read RFC-06 Storage Engine
- [ ] Read RFC-07 Evaluation Engine
- [ ] No direct Bedrock usage
- [ ] No repository access inside specialists
- [ ] Manager owns orchestration
- [ ] Specialists remain independent
- [ ] Message passing is typed
- [ ] Tests included
- [ ] Documentation updated

---

# 31. Out of Scope

Do not implement:

- Peer-to-peer specialist communication
- Consensus voting
- Human reviewers
- Dashboard visualization
- Statistical analysis
- Dynamic specialist discovery
- Parallel execution optimization

These belong to future RFCs.

---

# 32. Future Improvements

Future versions may support:

## Dynamic Planning

Manager selects specialists based on changed files.

---

## Parallel Execution

Run independent specialists concurrently.

---

## LLM-Based Synthesis

Replace deterministic merge rules with an LLM synthesis agent.

---

## Adaptive Specialists

Add reviewers for:

- Security
- Performance
- DevOps
- Infrastructure
- Testing
- Documentation

without modifying the Manager Agent.

---

## Replay Visualization

Visualize:

- ReviewPlan
- AgentMessages
- ConversationHistory

inside the Research Dashboard.

---

# Summary

The Hierarchical Authority Review Architecture introduces the first multi-agent communication topology in the research platform.

A Manager Agent coordinates multiple specialized reviewers through deterministic message passing, centralized orchestration, and structured result synthesis.

Compared with Agentless, Hierarchical increases specialization while maintaining a controlled communication topology. The architecture is designed to isolate the effects of centralized coordination, enabling rigorous comparison with both the single-agent baseline (RFC-04) and the decentralized consensus architecture introduced in RFC-09.

This RFC represents the first experimental treatment in the thesis and provides the foundation for evaluating whether hierarchical multi-agent coordination improves automated code review quality over a single general-purpose reviewer.