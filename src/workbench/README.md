# Research Workbench (RFC-11)

A **read-only backend** that aggregates already-generated experiment artifacts
into presentation-ready view models for a researcher-facing UI. It does **not**
execute experiments, call an LLM, compute metrics, or write export files — it
visualizes what the platform has already produced.

> Spec: `docs/implementaion/11-research-workbench.md`

```
Storage Engine ─┐
Evaluation Engine ─┤→ Research Workbench → presentation view models
Export Service ─┘
```

**Deterministic and read-only**: no Bedrock, no Prompt Builder, no review
architectures, no `Date.now`/randomness. It depends only on the Storage and
Evaluation engines and a small set of read ports.

## The interface

The UI depends on one interface (RFC-11 §9):

```ts
interface IResearchWorkbench {
  getExperiments(): Promise<ExperimentSummaryView[]>;
  getExperiment(id: string): Promise<ExperimentDetailView>;
  getComparison(snapshotId: string): Promise<ArchitectureComparisonView>;
  getReplay(experimentId: string): Promise<ReplayView>;
  getMetrics(experimentId: string): Promise<MetricsView>;
  getExportHistory(): Promise<ExportHistoryView>;
}
```

## Architecture: orchestrator + pluggable builders

`WorkbenchService` **orchestrates** (list/load, dispatch to focused services);
each domain→presentation transform is a pluggable **view builder** implementing
the platform's standard strategy contract (like `IReviewArchitecture`,
`ILLMProvider`, `IConsensusProtocol`, `IExperimentExporter`):

```ts
interface IWorkbenchViewBuilder<TInput, TOutput> {
  build(input: TInput): TOutput; // pure, synchronous, no I/O, no calculation
}
```

```
src/workbench/
├── workbench-service.ts         # IResearchWorkbench + WorkbenchService (orchestrator)
├── replay-service.ts            # ConversationHistory → ReplayView
├── comparison-service.ts        # gather snapshot's experiments → ArchitectureComparisonView
├── metrics-service.ts           # evaluate one experiment → MetricsView
├── export-history-service.ts    # recorded exports → ExportHistoryView
├── create-research-workbench.ts # composition root (in-memory stores)
├── ports.ts                     # ExperimentReadPort / SnapshotReadPort / ConversationHistoryReadPort / ExportHistoryReadPort
├── workbench-errors.ts          # WorkbenchError / WorkbenchArtifactUnavailableError
├── builders/
│   ├── workbench-view-builder.ts     # IWorkbenchViewBuilder<TInput, TOutput>
│   ├── replay-view-builder.ts
│   ├── comparison-view-builder.ts
│   ├── metrics-view-builder.ts
│   ├── export-history-view-builder.ts
│   ├── experiment-summary-view-builder.ts   # additive
│   └── experiment-detail-view-builder.ts     # additive
├── in-memory/
│   ├── in-memory-experiment-read-store.ts
│   ├── in-memory-conversation-store.ts
│   └── in-memory-export-history-store.ts
└── models/                      # ReplayStep/View, ComparisonChart, *View, ExportRecord, ...
```

## Data sources (read ports)

The Workbench needs to **browse** experiments and read conversations/export
metadata — capabilities the RFC-01/02 write-side repositories do not expose. To
avoid modifying earlier RFCs, the Workbench defines its own read ports and ships
in-memory implementations that a composition root seeds:

- `ExperimentReadPort` — `list()` + `getById()`
- `SnapshotReadPort` — `getById()` (the RFC-02 `SnapshotRepository` satisfies this directly)
- `ConversationHistoryReadPort` — `getByExperimentId()` (for replay)
- `ExportHistoryReadPort` — `list()` (RFC-10 export metadata)

## Separation of concerns

- **No metric calculation.** `ComparisonService`/`MetricsService` delegate to the
  Evaluation Engine and only reshape its output; builders copy values through.
- **No export generation.** Exports come from the RFC-10 Export Service; the
  Workbench records their metadata and reads it back.
- **No replay logic in architectures.** Replay is derived entirely from
  `ConversationHistory` by `ReplayViewBuilder`.

## Usage

```ts
import { createResearchWorkbench } from "./src/workbench/index.ts";

// Share the pipeline's storage + snapshot repo so the Workbench reads real data.
const wb = createResearchWorkbench({ storage, snapshots });
wb.experiments.add(experiment);          // seed browseable experiments
wb.conversations.record(id, history);    // seed replays (hierarchical/consensus)
wb.exportHistory.record(exportResult);   // record an RFC-10 export

const detail = await wb.workbench.getExperiment(experimentId);
```

Run the end-to-end demo (mock provider, no Bedrock):

```
npm run demo:workbench
```

## Out of scope (this RFC is backend only)

No Next.js / React / HTML / CSS, authentication, dashboard UI, graph rendering,
Bedrock, LLM calls, metric calculation, or experiment execution. The `apps/`
frontend described in the spec is intentionally **not** implemented here.
