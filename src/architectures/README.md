# Review Architecture Framework (RFC-03)

The Review Architecture Framework defines the common execution model for every
code-review topology. The Experiment Engine delegates *all* review execution to
interchangeable architecture plugins resolved through a registry, so it contains
**no architecture-specific logic** and a new topology can be added without
touching it.

> Spec: `docs/implementaion/03-review-architecture-framework.md`
> Guidelines: `docs/implementaion/00-development-guidelines.md`

---

## Scope of this RFC

Implemented:

- `IReviewArchitecture` — the plugin contract
- `ReviewExecutionInput` — uniform input, using the unified RFC-02 `PRSnapshot`
- `RawReviewResult` — the unvalidated architecture output (RFC-03 shape)
- `ArchitectureRegistry` interface + `InMemoryArchitectureRegistry` (`register` / `get`)
- `UnknownArchitectureError` (typed, non-retryable)
- `MockReviewArchitecture` — dependency-free test/demo architecture
- Experiment Engine resolves + executes architectures through the registry only
- End-to-end demo (`npm run demo:framework`) + integration test

Explicitly **out of scope** (future RFCs):

- Real Agentless / Hierarchical / Consensus implementations
- LLM provider abstraction (OpenAI / Bedrock)
- Prompt loading, validation engine, storage engine, dashboard, AWS

---

## Folder structure

```
src/architectures/
├── review-architecture.ts          # IReviewArchitecture + ArchitectureRegistry (interfaces)
├── in-memory-architecture-registry.ts
├── mock/mock-review-architecture.ts # MockReviewArchitecture (no LLM)
└── index.ts
```

The interfaces live in `review-architecture.ts`; `RawReviewResult` /
`ReviewExecutionInput` live with the domain models in `src/models/review-result.ts`.
Real architectures (Agentless, …) will each get a self-contained sub-folder.

## Public interfaces

```ts
type ReviewArchitecture = "agentless" | "hierarchical" | "consensus";

interface IReviewArchitecture {
  readonly name: ReviewArchitecture;
  execute(input: ReviewExecutionInput): Promise<RawReviewResult>;
}

interface ArchitectureRegistry {
  register(architecture: IReviewArchitecture): void;
  get(name: ReviewArchitecture): IReviewArchitecture;   // throws UnknownArchitectureError
}

interface ReviewExecutionInput {       // identical for every architecture (fair comparison)
  experimentId: string;
  snapshot: PRSnapshot;                // the unified RFC-02 snapshot
  modelVersion: string;
  promptVersion: string;
  workflowVersion: string;
}

interface RawReviewResult {            // unvalidated; the engine never inspects it
  architecture: ReviewArchitecture;
  summary: string;
  rawOutput: unknown;
  findings: unknown;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  messageCount: number;
}
```

## How the engine uses it

```
Experiment Engine
  → registry.get(experiment.architecture)     // the ONLY coupling point
  → architecture.execute(reviewExecutionInput)
  → RawReviewResult  → validation port → evaluation port → completed
```

The engine imports no concrete architecture. Adding a fourth topology is:
implement `IReviewArchitecture`, then `registry.register(new X())` at composition
time. No engine change.

## Usage

```ts
const registry = new InMemoryArchitectureRegistry();
registry.register(new MockReviewArchitecture({ name: "agentless" }));

const { service } = createExperimentService({ registry, snapshots });
await service.runExperiment({ snapshotId, architecture: "agentless", /* …versions */ });
```

End-to-end (import a diff, then run an architecture against it):
`npm run demo:framework`.

---

## Implementation decisions

1. **`RawReviewResult` aligned to RFC-03.** RFC-01 (`01-experiment-engine.md`)
   and RFC-03 (`03-review-architecture-framework.md`) describe `RawReviewResult`
   differently: RFC-01 had `rawOutput` + optional `rawOutputText`; RFC-03 adds
   `summary: string` and `findings: unknown` and drops `rawOutputText`. Since
   `RawReviewResult` is the architecture's *output contract*, the RFC-03
   definition is authoritative and the model now matches it. The Experiment
   Engine is unaffected (it only reads the metric fields and passes the result
   to the validation port); the mock and one test literal were updated. This
   doc-level discrepancy is noted, not silently resolved — the architecture docs
   were left unchanged per the task.

2. **`ArchitectureRegistry.get()` (was `getArchitecture`).** RFC-03 names the
   resolver `get`, so the interface method was renamed to match the spec; the
   single engine call site and the tests were updated. `register` is part of the
   interface (matching RFC-03's registry surface) though the engine only ever
   calls `get`.

3. **Interface + in-memory adapter, not a bare class.** RFC-03 sketches
   `ArchitectureRegistry` as a class; we keep it as an interface with an
   `InMemoryArchitectureRegistry` implementation so the engine depends on an
   abstraction (interface-first / DI, per the guidelines). Behaviour matches the
   spec (`register` + `get`).

4. **Unknown architecture is a typed, non-retryable failure.** `get` throws
   `UnknownArchitectureError`; the engine records it as a failed experiment (the
   retry policy marks unknown architectures non-retryable).

5. **Tooling unchanged.** Native TypeScript on `node:test`, string-literal
   unions, no parameter properties, `erasableSyntaxOnly`. See the
   [RFC-01 README](../engines/experiment/README.md#build--test-workflow).
