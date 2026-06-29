# 01 — Experiment Engine

## Objective

The Experiment Engine is the core runtime of the AI Code Review Experiment Platform.

Its purpose is to execute one review architecture against one immutable PR Snapshot, collect the result, validate the output, persist the findings, and trigger evaluation.

The Experiment Engine does **not** perform code review itself. It coordinates the execution of review architectures such as:

* Agentless
* Hierarchical Authority
* Decentralized Peer Consensus

The Experiment Engine is responsible for making experiments reproducible, replayable, versioned, and measurable.

---

## Role in the Platform

```text
PR Snapshot
    ↓
Experiment Engine
    ↓
Selected Review Architecture
    ↓
Validation Layer
    ↓
Storage Layer
    ↓
Evaluation Engine
    ↓
Dashboard / CSV Export
```

The Experiment Engine is the bridge between the research design and the software implementation.

---

## Core Responsibilities

The Experiment Engine is responsible for:

1. Creating experiment records.
2. Loading immutable PR Snapshots.
3. Selecting the requested review architecture.
4. Executing the architecture workflow.
5. Tracking experiment status.
6. Measuring execution time.
7. Capturing token usage and model cost.
8. Passing architecture output to the Validation Layer.
9. Persisting validated findings.
10. Triggering the Evaluation Engine.
11. Supporting replay of historical PR Snapshots.
12. Preventing duplicate or corrupted experiment records.

---

## Non-Responsibilities

The Experiment Engine is **not** responsible for:

* calling GitHub directly
* parsing unified diffs
* writing prompts
* judging finding correctness manually
* rendering dashboard pages
* computing detailed precision or recall itself
* performing code review logic

Those responsibilities belong to other modules.

---

## Experiment Definition

An experiment represents a single execution of one review architecture against one PR Snapshot.

```ts
export type ExperimentStatus =
  | "created"
  | "queued"
  | "running"
  | "validating"
  | "evaluating"
  | "completed"
  | "failed";

export type ReviewArchitecture =
  | "agentless"
  | "hierarchical"
  | "consensus";

export interface Experiment {
  experimentId: string;
  snapshotId: string;
  architecture: ReviewArchitecture;

  modelVersion: string;
  promptVersion: string;
  workflowVersion: string;
  evaluationVersion: string;

  status: ExperimentStatus;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  totalLatencyMs?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  estimatedCostUsd?: number;

  errorMessage?: string;
}
```

---

## Experiment Identity

Each experiment should have a deterministic identity based on:

```text
snapshotId
architecture
modelVersion
promptVersion
workflowVersion
evaluationVersion
```

Example:

```text
snap_042#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1
```

This prevents accidental duplicate experiments.

---

## Idempotency Rules

The Experiment Engine must enforce the following rules:

| Existing State       | New Request Behavior                              |
| -------------------- | ------------------------------------------------- |
| No experiment exists | Create new experiment                             |
| Experiment completed | Return existing result unless `forceRerun = true` |
| Experiment running   | Return existing experiment ID                     |
| Experiment failed    | Allow retry                                       |
| `forceRerun = true`  | Create new versioned experiment                   |

This protects the dataset from accidental duplication.

---

## Experiment Lifecycle

```text
created
   ↓
queued
   ↓
running
   ↓
validating
   ↓
evaluating
   ↓
completed
```

Failure path:

```text
running / validating / evaluating
   ↓
failed
```

Retry path:

```text
failed
   ↓
queued
```

---

## Main Flow

```text
1. Receive experiment request
2. Check idempotency key
3. Create or reuse experiment record
4. Load PR Snapshot
5. Resolve architecture implementation
6. Execute architecture
7. Validate architecture output
8. Store validated findings
9. Compute metrics
10. Mark experiment completed
```

---

## Sequence Diagram

```text
User
  ↓
POST /api/experiments/run
  ↓
Experiment API
  ↓
Experiment Service
  ↓
Experiment Engine
  ↓
Architecture Registry
  ↓
Selected Architecture
  ↓
Validation Layer
  ↓
Storage Layer
  ↓
Evaluation Engine
  ↓
Experiment Completed
```

---

## Public Interface

```ts
export interface RunExperimentInput {
  snapshotId: string;
  architecture: ReviewArchitecture;
  modelVersion: string;
  promptVersion: string;
  workflowVersion: string;
  evaluationVersion: string;
  forceRerun?: boolean;
}

export interface RunExperimentResult {
  experimentId: string;
  status: ExperimentStatus;
  reusedExisting: boolean;
}

export interface IExperimentEngine {
  run(input: RunExperimentInput): Promise<RunExperimentResult>;
  retry(experimentId: string): Promise<RunExperimentResult>;
  getStatus(experimentId: string): Promise<ExperimentStatus>;
}
```

---

## Architecture Registry

The Experiment Engine should not contain architecture-specific logic.

Instead, it uses an architecture registry.

```ts
export interface IReviewArchitecture {
  name: ReviewArchitecture;

  execute(input: ReviewExecutionInput): Promise<RawReviewResult>;
}

export interface ArchitectureRegistry {
  getArchitecture(name: ReviewArchitecture): IReviewArchitecture;
}
```

Example:

```ts
const registry = new Map<ReviewArchitecture, IReviewArchitecture>();

registry.set("agentless", new AgentlessArchitecture());
registry.set("hierarchical", new HierarchicalArchitecture());
registry.set("consensus", new ConsensusArchitecture());
```

---

## Review Execution Input

Every architecture receives the same input structure.

```ts
export interface ReviewExecutionInput {
  experimentId: string;
  snapshot: PRSnapshot;
  modelVersion: string;
  promptVersion: string;
  workflowVersion: string;
}
```

---

## Raw Review Result

Architectures return raw results before validation.

```ts
export interface RawReviewResult {
  architecture: ReviewArchitecture;
  rawOutput: unknown;
  rawOutputText?: string;

  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  messageCount: number;
}
```

Raw output is passed to the Validation Layer.

The Experiment Engine should not trust raw model output.

---

## Validated Review Result

After validation, the result becomes structured and safe to store.

```ts
export interface ValidatedReviewResult {
  architecture: ReviewArchitecture;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: ReviewFinding[];
  messageCount: number;
}
```

---

## Error Handling

### Architecture Execution Failure

If the selected architecture fails:

1. Store error message.
2. Mark experiment as `failed`.
3. Do not compute metrics.
4. Preserve raw logs if available.

### Validation Failure

If validation fails:

1. Retry once using repair logic.
2. If still invalid, mark experiment as `failed`.
3. Do not store invalid findings.

### Storage Failure

If storage fails:

1. Mark experiment as `failed`.
2. Log storage error.
3. Allow retry.

### Evaluation Failure

If evaluation fails after valid findings are stored:

1. Mark experiment as `failed`.
2. Preserve validated findings.
3. Allow evaluation retry.

---

## Retry Strategy

Recommended retry policy:

| Failure Type         | Retry? |     Max Attempts |
| -------------------- | -----: | ---------------: |
| LLM timeout          |    Yes |                2 |
| Invalid JSON         |    Yes | 1 repair attempt |
| Storage error        |    Yes |                2 |
| Unknown architecture |     No |                0 |
| Missing PR Snapshot  |     No |                0 |

Retries must not create duplicate findings.

---

## Persistence Interaction

The Experiment Engine uses repositories instead of direct database access.

```text
Experiment Engine
    ↓
ExperimentRepository
SnapshotRepository
FindingRepository
MetricsRepository
```

Required repository methods:

```ts
export interface ExperimentRepository {
  findByIdempotencyKey(key: string): Promise<Experiment | null>;
  create(experiment: Experiment): Promise<void>;
  updateStatus(experimentId: string, status: ExperimentStatus): Promise<void>;
  markFailed(experimentId: string, errorMessage: string): Promise<void>;
  markCompleted(experimentId: string, summary: ExperimentCompletionSummary): Promise<void>;
}
```

---

## API Contract

### Start Experiment

```http
POST /api/experiments/run
```

Request:

```json
{
  "snapshotId": "snap_042",
  "architecture": "agentless",
  "modelVersion": "gpt-4.1",
  "promptVersion": "prompt-v1",
  "workflowVersion": "workflow-v1",
  "evaluationVersion": "eval-v1"
}
```

Response:

```json
{
  "experimentId": "exp_abc123",
  "status": "queued",
  "reusedExisting": false
}
```

### Get Experiment Status

```http
GET /api/experiments/:experimentId
```

Response:

```json
{
  "experimentId": "exp_abc123",
  "status": "completed",
  "architecture": "agentless",
  "totalLatencyMs": 14320,
  "totalInputTokens": 12400,
  "totalOutputTokens": 2100,
  "estimatedCostUsd": 0.21
}
```

---

## Local Runner vs AWS Runner

The Experiment Engine should support two runner modes.

### Local Runner

Used during development.

```text
Experiment Engine
    ↓
Run architecture in local Node process
```

Benefits:

* easier debugging
* lower cost
* faster iteration

### AWS Runner

Used during deployed research execution.

```text
Experiment Engine
    ↓
Step Functions / Worker Lambda
```

Benefits:

* avoids web request timeout
* better monitoring
* scalable execution

The review architecture logic should be shared between both modes.

---

## Logging Requirements

Every log message must include:

```text
experimentId
snapshotId
architecture
status
```

Example:

```json
{
  "level": "info",
  "experimentId": "exp_abc123",
  "architecture": "hierarchical",
  "message": "Frontend specialist completed",
  "latencyMs": 4200
}
```

---

## Metrics Captured by the Experiment Engine

The Experiment Engine captures execution-level metrics:

* total latency
* number of LLM calls
* input tokens
* output tokens
* estimated cost
* message count
* retry count
* failure count

It does **not** compute research metrics such as precision or recall. Those are computed by the Metrics Engine.

---

## Design Decisions

### Decision 1 — Experiment Engine as Central Runtime

The platform is experiment-centric. Therefore, all execution begins through the Experiment Engine.

### Decision 2 — Architecture Plugin Interface

Review architectures are plugins implementing `IReviewArchitecture`.

### Decision 3 — Validation Before Storage

Raw model outputs must be validated before findings enter the research dataset.

### Decision 4 — Idempotency Key

Every experiment uses a deterministic idempotency key to prevent duplicate records.

### Decision 5 — Local Runner First

The first implementation should support local execution before AWS orchestration.

---

## Implementation Order

Implement the Experiment Engine in this order:

1. Define experiment types.
2. Define `IReviewArchitecture`.
3. Implement architecture registry.
4. Implement local runner.
5. Implement experiment repository interface.
6. Implement status transitions.
7. Add idempotency logic.
8. Connect Agentless architecture.
9. Add validation call.
10. Add metrics handoff.

---

## Minimum Viable Implementation

The minimum useful Experiment Engine supports:

```text
Create experiment
Load snapshot
Run Agentless
Validate output
Store findings
Mark completed
```

This should be completed before implementing Hierarchical or Consensus.

---

## Future Improvements

Future versions may add:

* Step Functions orchestration
* parallel execution
* automatic replay scheduling
* batch experiment runs
* experiment comparison groups
* model comparison experiments
* prompt A/B testing
* dashboard progress streaming

---

## Summary

The Experiment Engine is the most important implementation module in the platform.

It ensures that every review architecture is executed consistently, reproducibly, and safely.

All other subsystems connect to the Experiment Engine.
