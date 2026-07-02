# Experiment Campaign Runner

Orchestrates an entire benchmark campaign automatically: it loads benchmark
instances and runs **Agentless, Hierarchical, and Consensus** on every instance,
tracking progress, recording a reproducible manifest, retrying transient
failures, resuming interrupted runs, summarizing, and exporting campaign-level
CSV/JSON.

> Methodology: `docs/experiment/01-experiment-plan.md`,
> `02-benchmark-selection.md`, `03-runbook.md`.

```
BenchmarkDataset[]
   │  BenchmarkLoader.flatten
   ▼
per instance:  Import (once) ──▶ shared PR snapshot
   │
   ├─ Agentless   ┐
   ├─ Hierarchical├─ ExperimentExecutor → Experiment → Validation → Storage
   └─ Consensus   ┘                     → Evaluation → Ground Truth
   ▼
Manifest (progress + metadata + resume)  ProgressReporter (reproducible logs)
   ▼
CampaignSummary + benchmark CSV + comparisons CSV/JSON + campaign JSON
```

**Orchestration only.** The campaign defines **no new metrics** and modifies no
existing service. Every artifact is produced by the existing engines — Import
(RFC-02), Experiment/Validation/Storage (RFC-01/05/06), Evaluation (RFC-07),
Export (RFC-10), and the Benchmark layer (RFC-13). Deterministic: timestamps come
from an injected `Clock` (use `FixedClock` for byte-identical logs); no
`Date.now`/randomness of its own.

## Files

```
src/campaign/
├── campaign-runner.ts     # CampaignRunner — the orchestrator + BENCHMARK_ARCHITECTURES
├── benchmark-loader.ts    # BenchmarkLoader — adapt raw datasets, flatten to instances
├── experiment-executor.ts # ExperimentExecutor — run ONE (instance, architecture, run)
├── manifest.ts            # Manifest + entries + progress + ManifestStore (resume)
├── progress-reporter.ts   # ProgressReporter — reproducible, sequenced log lines
├── retry-policy.ts        # RetryPolicy — transient vs terminal classification
├── campaign-summary.ts    # buildCampaignSummary — counts + per-architecture rollup
└── index.ts
```

## Fairness (the single independent variable)

The runbook requires every architecture to review the **identical** snapshot.
Manual/synthetic imports are *not* deduplicated by the Import Engine, so the
runner imports each instance **exactly once** and shares that `snapshotId` across
all three architectures. Repeated runs (`runsPerInstance > 1`) use `forceRerun`
so each is a distinct experiment.

## Manifest, progress, retries, resume

- **Manifest** — one entry per (instance, architecture, run) with status,
  attempts, `snapshotId`, `experimentId`, and the controlled versions +
  reproducibility metadata (model/prompt/workflow/eval, platform, git commit,
  region). It is the authoritative execution record (runbook §20).
- **Progress / logs** — `ProgressReporter` emits sequenced, reproducible lines
  (`#0001 … run-completed key=… experimentId=…`) surfaced on `report.logs`.
- **Retries** — `RetryPolicy` retries only transient infrastructure failures
  (provider errors, timeouts, throttling) up to 3 attempts; validation/adapter/
  parser errors are terminal and never retried (runbook §16–17). A terminal
  failure is recorded and the campaign continues.
- **Resume** — after every entry the manifest is saved via a `ManifestStore`.
  Re-running with the same store skips completed entries and reconstructs their
  outcomes from storage (no re-execution), so exports stay complete.

## Usage

```ts
import { CampaignRunner, InMemoryManifestStore, ProgressReporter } from "./src/campaign/index.ts";
import { FixedClock } from "./src/shared/clock.ts";

const runner = new CampaignRunner({
  importService, experimentService, storage,       // existing services
  reporter: new ProgressReporter({ clock: new FixedClock() }),
  manifestStore: new InMemoryManifestStore(),        // enables resume
  clock: new FixedClock(),
});

const report = await runner.run([qodoDataset, sweDataset], {
  campaignId: "campaign-2026-08",
  modelVersion, promptVersion, workflowVersion, evaluationVersion,
  runsPerInstance: 1,               // runbook recommends 3 for stochastic models
  generatedAt: "2026-08-01T00:00:00.000Z",
});
// report.manifest / report.summary / report.outcomes / report.exports / report.logs
```

Run the end-to-end demo (mock provider, no Bedrock):

```
npm run campaign:run
```

## Out of scope

No new evaluation metrics, no statistical analysis, no dashboard work, no
Bedrock. Persisting logs/manifests/exports to disk or S3 is left to the caller —
the core returns strings and a serializable manifest, and accepts a
`ManifestStore` port for durable resume.
