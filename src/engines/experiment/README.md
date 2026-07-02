# Experiment Engine (RFC-01)

The Experiment Engine is the core runtime of the AI Code Review Experiment
Platform. It executes **one review architecture** against **one immutable PR
Snapshot**, manages the experiment lifecycle, enforces idempotency, and reports
execution-level results.

It does **not** perform code review, parse diffs, validate JSON schemas, talk to
a database, or call an LLM. Those responsibilities belong to other modules and
are reached only through injected interfaces.

> Spec: `docs/implementaion/01-experiment-engine.md`
> Guidelines: `docs/implementaion/00-development-guidelines.md`

---

## Scope of this RFC

Implemented:

- Experiment **models** (`src/models/`)
- **Experiment Engine** (`src/engines/experiment/`)
- **Experiment Service** (`src/services/experiment/`)
- **Architecture Registry** interface + in-memory implementation (`src/architectures/`)
- **In-memory repositories** (`src/repositories/`)
- **Unit tests** (`tests/unit/`)

Explicitly **out of scope** (future RFCs) — present only as injected interfaces:

- Validation Engine, Storage Engine, Evaluation Engine, Dashboard
- Real review architectures (Agentless / Hierarchical / Consensus)
- Database, AWS, GitHub, OpenAI

No database, no AWS, no network. Mock/placeholder implementations are used where
a collaborator is owned by a future RFC.

---

## Folder structure

```
src/
├── models/                         # Domain types (no logic, no I/O)
│   ├── experiment.ts               #   Experiment, status, run input/result, completion summary
│   ├── snapshot.ts                 #   PRSnapshot (immutable input)
│   ├── finding.ts                  #   ReviewFinding, severity / risk levels
│   ├── review-result.ts            #   ReviewExecutionInput, Raw/Validated review results
│   └── index.ts
│
├── architectures/                  # Review-architecture plugin layer
│   ├── review-architecture.ts      #   IReviewArchitecture, ArchitectureRegistry (interfaces)
│   ├── in-memory-architecture-registry.ts
│   ├── mock/mock-review-architecture.ts   # MockReviewArchitecture (no LLM)
│   └── index.ts
│
├── repositories/                   # Persistence ports + in-memory adapters
│   ├── experiment-repository.ts    #   ExperimentRepository (interface)
│   ├── snapshot-repository.ts      #   SnapshotRepository (interface)
│   ├── in-memory/
│   │   ├── in-memory-experiment-repository.ts
│   │   └── in-memory-snapshot-repository.ts
│   └── index.ts
│
├── engines/experiment/             # The Experiment Engine
│   ├── ports.ts                    #   IOutputValidator, IEvaluationTrigger (future-RFC ports)
│   ├── placeholders.ts             #   NoopEvaluationTrigger (evaluation stand-in)
│   ├── experiment-engine.ts        #   ExperimentEngine + IExperimentEngine
│   └── index.ts
│
├── services/experiment/            # Application layer
│   ├── experiment-service.ts       #   ExperimentService (thin use-case coordinator)
│   ├── create-experiment-service.ts#   Composition root / factory
│   └── index.ts
│
└── shared/                         # Cross-cutting utilities
    ├── errors.ts                   #   Typed error hierarchy
    ├── logger.ts                   #   Logger port + Console/Noop loggers
    ├── clock.ts                    #   Clock port + System/Fixed clocks
    └── id.ts                       #   Idempotency key + IdGenerator
```

---

## Public interfaces

```ts
// engines/experiment
interface IExperimentEngine {
  run(input: RunExperimentInput): Promise<RunExperimentResult>;
  retry(experimentId: string): Promise<RunExperimentResult>;
  getStatus(experimentId: string): Promise<ExperimentStatus>;
}

// architectures
interface IReviewArchitecture {
  readonly name: ReviewArchitecture;
  execute(input: ReviewExecutionInput): Promise<RawReviewResult>;
}
interface ArchitectureRegistry {        // owned by RFC-03 (Review Architecture Framework)
  register(architecture: IReviewArchitecture): void;
  get(name: ReviewArchitecture): IReviewArchitecture;
}

// repositories
interface ExperimentRepository {
  findById(experimentId: string): Promise<Experiment | null>;
  findByIdempotencyKey(key: string): Promise<Experiment | null>;
  create(experiment: Experiment): Promise<void>;
  updateStatus(experimentId: string, status: ExperimentStatus): Promise<void>;
  markFailed(experimentId: string, errorMessage: string): Promise<void>;
  markCompleted(experimentId: string, summary: ExperimentCompletionSummary): Promise<void>;
}
interface SnapshotRepository {            // owned by RFC-02 (PR Import Engine)
  findByIdempotencyKey(key: string): Promise<PRSnapshot | null>;
  create(snapshot: PRSnapshot): Promise<void>;
  getById(snapshotId: string): Promise<PRSnapshot | null>;
}

// engines/experiment/ports — owned by future RFCs, mocked here
interface IOutputValidator {
  validate(raw: RawReviewResult, context?: OutputValidationContext): Promise<ValidatedReviewResult>;
}
interface IEvaluationTrigger {
  evaluate(experimentId: string, result: ValidatedReviewResult): Promise<void>;
}
```

---

## Lifecycle

```
created → queued → running → validating → evaluating → completed
                     │            │            │
                     └────────────┴────────────┴──────► failed   (retry → queued)
```

The engine drives the full state machine from the architecture spec. The RFC-01
Definition of Done only requires `created → running → completed`; that subset is
asserted explicitly in `tests/unit/experiment-engine.test.ts`.

## Idempotency

Identity key = `snapshotId#architecture#modelVersion#promptVersion#workflowVersion#evaluationVersion`.

| Existing state              | `run()` behaviour                         |
| --------------------------- | ----------------------------------------- |
| none                        | create + execute                          |
| completed                   | return existing (`reusedExisting: true`)  |
| queued / running / …        | return existing id (`reusedExisting: true`) |
| failed                      | re-execute (retry)                        |
| `forceRerun: true`          | create new versioned experiment + execute |

---

## Usage

```ts
import { createExperimentService } from "./src/services/experiment/index.ts";
import { InMemoryArchitectureRegistry, MockReviewArchitecture }
  from "./src/architectures/index.ts";

const registry = new InMemoryArchitectureRegistry();
registry.register(new MockReviewArchitecture({ name: "agentless" }));

const { service, snapshots } = createExperimentService({ registry });
await snapshots.save(/* a PRSnapshot */);

const result = await service.runExperiment({
  snapshotId: "snap_001",
  architecture: "agentless",
  modelVersion: "gpt-4.1",
  promptVersion: "prompt-v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
});
// result => { experimentId, status: "completed", reusedExisting: false }
```

Later RFCs swap real adapters in via the same factory, e.g.
`createExperimentService({ experiments: new DynamoExperimentRepository(), validator: new ValidationEngine() })`.

---

## Build & test workflow

**There is no compile/build step.** TypeScript is executed *directly* by Node's
native type stripping — Node erases the type annotations at load time and runs
the result. `tsc` is used **only for type checking** (`--noEmit`); it never
produces the JavaScript that runs. This keeps iteration fast and tooling minimal.

`tsconfig.json` sets `erasableSyntaxOnly: true`, so `tsc` rejects any syntax that
Node's stripper cannot erase (enums, `namespace`, constructor parameter
properties). That makes the type checker the guard-rail for our conventions —
a non-erasable construct fails `npm run typecheck` before it can fail at runtime.

| Script | Command | Purpose |
| ------ | ------- | ------- |
| `npm run typecheck` | `tsc -p tsconfig.json` | Strict type check, no emit. Also enforces `erasableSyntaxOnly`. |
| `npm test` | `node --test "tests/unit/**/*.test.ts"` | Run unit tests on the built-in `node:test` runner (native TS). |
| `npm run test:watch` | `node --test --watch …` | Tests in watch mode. |
| `npm run demo` | `node scripts/demo-experiment-engine.ts` | Run one experiment end-to-end through a mock architecture; prints every lifecycle transition. |
| `npm run check` | `typecheck && test` | The full gate — run this before every commit/PR. |

```bash
npm install      # one-time: installs typescript + @types/node (devDeps only)
npm run check    # typecheck + tests — the pre-commit gate
npm run demo     # see the CREATED → … → COMPLETED lifecycle in action
```

Requires **Node ≥ 22.18** (native TypeScript type stripping; the repo is
developed on Node 25). No bundler, Jest/Vitest, or ts-node.

> **Why no `build` script?** This is a research platform run via `node` (locally
> and, later, in AWS workers) — it is not published as a compiled npm package, so
> emitting `dist/` JavaScript would add a step with no consumer. If a future RFC
> needs distributable JS, add an emit-only `build` target then (flip `noEmit` and
> set `outDir`); don't add it preemptively.

---

## Implementation decisions

1. **Engine depends only on interfaces.** The engine receives every collaborator
   (`ArchitectureRegistry`, repositories, validator/evaluator ports, `Clock`,
   `IdGenerator`, `Logger`) via constructor DI. It contains no
   architecture-specific logic, so adding a fourth topology requires zero engine
   changes (Principle 11).

2. **Validation & Evaluation are ports.** The engine depends on
   `IOutputValidator` / `IEvaluationTrigger`, never on concrete implementations.
   As of **RFC-05** the validator is the real `ValidationEngine` (`src/validation`,
   wired by the composition root); evaluation is still a `NoopEvaluationTrigger`
   placeholder until the Evaluation Engine RFC. This preserves the
   *validate-before-evaluate* flow while keeping the engine decoupled.

3. **Full state machine, not just the DoD subset.** "Do not change the
   architecture" takes priority, so the engine implements the complete
   `created → … → completed` sequence. The DoD's `created → running → completed`
   is verified as a subsequence.

4. **Finding persistence is deferred.** Storing findings belongs to the Storage
   Engine RFC, so the engine validates and triggers evaluation but does not
   persist findings. This trivially satisfies "retries must not create duplicate
   findings."

5. **Deterministic identity.** A first run's `experimentId` *is* its idempotency
   key (reproducible). `forceRerun` allocates a versioned `#rerun-N` id so
   historical experiments are never overwritten (Principle: immutable data).

6. **`findById` added to `ExperimentRepository`.** The spec lists repository
   methods as the *required minimum* but `getStatus`/`retry` take an
   `experimentId`, so a lookup-by-id is necessary. This is an additive,
   non-architectural extension — noted here rather than treated as a spec
   contradiction.

7. **Typed errors.** All failures throw subclasses of `DomainError`
   (`WorkflowError`, `ValidationError`, `StorageError`, `UnknownArchitectureError`,
   `SnapshotNotFoundError`, `ExperimentNotFoundError`, …) per the guidelines.

8. **Execution metrics only.** The engine records timing, tokens, cost, and
   message count (from `RawReviewResult`). Research metrics (precision/recall/…)
   are explicitly left to the Evaluation Engine.

9. **Tooling: native TypeScript on `node:test`.** No bundler, Jest, or ts-node.
   Constructor *parameter properties* and *enums* are avoided because Node's
   native type-stripping rejects them; string-literal unions (already preferred
   by the guidelines) and explicit field assignment are used instead. Relative
   imports use explicit `.ts` extensions (`allowImportingTsExtensions`).

### Notes on documentation paths

The implementation docs live under `docs/implementaion/` (sic) and the design
file is `02-design-principles.md` / `07-application-archtecture.md` (sic) — the
on-disk names differ slightly from the task's listing. The correct files were
read; no spec inconsistency was found that blocked implementation.
