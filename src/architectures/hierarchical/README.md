# Hierarchical Authority Review Architecture (RFC-08)

The first **multi-agent** review topology and the first experimental treatment:
a **Manager Agent** coordinates specialized reviewers (Backend, Frontend,
Database), then deterministically synthesizes their findings into one review.
Compare against the Agentless baseline (RFC-04).

> Spec: `docs/implementaion/08-hierarchical.md`

```
Manager Agent
  ├─ Backend Reviewer ─┐
  ├─ Frontend Reviewer ─┼─→ Synthesizer (dedup + conflict) → RawReviewResult
  └─ Database Reviewer ─┘
```

Implements `IReviewArchitecture` (`name = "hierarchical"`), so it plugs into the
Experiment Engine exactly like Agentless.

## Files

```
src/architectures/hierarchical/
├── hierarchical-architecture.ts   # HierarchicalArchitecture + createHierarchicalArchitecture
├── manager-agent.ts               # ManagerAgent (deterministic state machine)
├── synthesizer.ts                 # deterministic merge/dedup/conflict/summary
├── review-plan.ts                 # ReviewPlan + IReviewPlanner + DefaultReviewPlanner
├── messages.ts                    # AgentRole, AgentMessageType, AgentMessage
├── conversation-history.ts        # ConversationHistory
├── specialists/
│   ├── review-specialist.ts       # IReviewSpecialist + LlmReviewSpecialist + parse helper
│   ├── backend-reviewer.ts / frontend-reviewer.ts / database-reviewer.ts
└── models/
    ├── specialist-review-result.ts / hierarchical-review-result.ts / hierarchical-metrics.ts
```
Role prompts live in the LLM layer: `src/llm/prompts/templates/v1/hierarchical/{backend,frontend,database}.md`.

## Key design points

- **Plugin specialists.** The Manager depends only on `IReviewSpecialist[]`
  (and `IReviewPlanner`) — never on concrete reviewer classes. New specialists
  (security, performance, …) register without changing the Manager. Mirrors
  `IReviewArchitecture` / `ILLMProvider` / `IEvidenceScorer`.
- **Deterministic state machine**: `created → planning → dispatching →
  collecting → synthesizing → completed`; any failure → `failed`. No retries, no
  partial completion (fail fast).
- **Strict hierarchy**: Manager ↔ Specialist only; no peer-to-peer. Every
  exchange is a typed `AgentMessage` recorded in the `ConversationHistory`.
- **Each specialist** independently builds a role prompt via the shared
  `PromptBuilder` and makes exactly one `ILLMProvider` call. The Manager never
  calls Bedrock.
- **Deterministic synthesis** (no second LLM): dedup by `file+line+title`,
  resolve conflicts (highest severity, then highest confidence), count
  duplicates, generate summary.

## Metrics

`HierarchicalMetrics { specialistCount, llmCalls, messageCount, duplicateCount,
mergeLatencyMs }`. The core metrics flow into `RawReviewResult` — unlike
Agentless (`llmCalls = 1`, `messageCount = 1`), hierarchical yields `llmCalls =
specialistCount` (3) and `messageCount > 1` (8 = 2·specialists + 2 merge). These
reach RFC-07 evaluation via the validated result.

## Usage / demo

```ts
registry.register(createHierarchicalArchitecture({ provider, promptBuilder, rawDiffStorage }));
// then run an experiment with architecture: "hierarchical"
```
`npm run demo:hierarchical` (mock provider; full pipeline → metrics).

## Deviations (see compliance report)

1. `IReviewPlanner.createPlan(input: ReviewExecutionInput)` (not `PRSnapshot` as
   §13.1 sketches) — `ReviewPlan.experimentId` needs the experiment id.
2. `SpecialistReviewResult` adds `estimatedCostUsd` (beyond §19) — the provider
   returns it; summing actual per-call cost beats re-deriving it.
3. `ReviewPlan`/`ConversationHistory`/`SpecialistReviewResult`/`HierarchicalMetrics`
   are produced but not persisted (§25 aspirational — would require extending
   the Storage Engine, out of RFC-08 scope). The standard metrics (`llmCalls`,
   `messageCount`, tokens, latency, cost) do reach storage/evaluation via
   `RawReviewResult`.
