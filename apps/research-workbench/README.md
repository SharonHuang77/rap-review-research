# Research Dashboard (RFC-11 UI)

A minimal, demo-ready dashboard that displays the **Research Workbench** view
models (`src/workbench`). It is **frontend/presentation only**: server-rendered
HTML tables, no client framework, no build step, and **no new dependencies**.

> Backend: [`src/workbench/README.md`](../../src/workbench/README.md) ·
> Spec: `docs/implementaion/11-research-workbench.md`

## Run it

```
npm run dashboard
# open http://localhost:4317/  (override with PORT=... )
```

## Pages

| Route | Shows |
|-------|-------|
| `/experiments` | Experiment list (id, snapshot, architecture, status, prompt, model, created) |
| `/experiment?id=…` | Experiment detail: metadata, PR summary, findings, raw output |
| `/comparison?snapshot=…` | Architecture comparison table (Agentless vs Hierarchical vs Consensus) + chart series |
| `/metrics?id=…` | Cost and quality summary tables |
| `/replay?id=…` | Conversation replay timeline table |
| `/exports` | Export history table + CSV/JSON download buttons |
| `/export?format=csv\|json` | Downloads a dataset via the RFC-10 Export Service |

## How it stays within scope

- **No backend business logic and no metric calculation in the UI.** The pages
  render Workbench view models verbatim; `render.ts` is pure string-building with
  HTML escaping. Comparison/metrics numbers come from the Evaluation Engine via
  the Workbench.
- **No LLM calls, no experiment execution.** `sample-data.ts` seeds the existing
  Workbench with representative artifacts (one snapshot reviewed by all three
  architectures, recorded conversations, and two recorded exports) because the
  HTTP APIs that would feed a real deployment are not wired yet.
- **Exports** are produced by the existing RFC-10 Export Service — the dashboard
  only wires the button to it; it never serializes datasets itself.
- **No styling framework / chart library.** A few inline CSS rules for legible
  tables; "charts" are rendered as small label/value tables.

## Files

```
apps/research-workbench/
├── server.ts        # node:http dev server (routes → Workbench → render)
├── render.ts        # pure view-model → HTML functions (unit-tested)
├── sample-data.ts   # seeds the Workbench with demo artifacts
└── README.md
```

## Toward a real frontend

Swap `sample-data.ts` for an HTTP client against a Workbench API exposing
`IResearchWorkbench`, and (optionally) replace the server-rendered tables with a
component framework. The render layer already models each page, so the view
contracts would not change.
