# RAP Review Research — AI Code Review Experiment Platform

A research platform for executing and evaluating multiple multi-agent code-review
communication topologies under controlled, reproducible conditions.

See `docs/` for the full architecture and implementation specifications.

## Implemented modules

| RFC    | Module            | Location                     | Docs |
| ------ | ----------------- | ---------------------------- | ---- |
| RFC-01 | Experiment Engine | `src/engines/experiment/`    | [module README](src/engines/experiment/README.md) |
| RFC-02 | PR Import Engine  | `src/engines/pr-import/`     | [module README](src/engines/pr-import/README.md) |
| RFC-03 | Review Architecture Framework | `src/architectures/` | [module README](src/architectures/README.md) |
| RFC-03.5 | Shared LLM Architecture | `src/llm/` | [module README](src/llm/README.md) |
| RFC-04 | Agentless Review Architecture | `src/architectures/agentless/` | [module README](src/architectures/agentless/README.md) |
| RFC-05 | Validation & Result Processing | `src/validation/` | [module README](src/validation/README.md) |
| RFC-06 | Storage Engine | `src/storage/` | [module README](src/storage/README.md) |
| RFC-07 | Research Evaluation Engine | `src/evaluation/` | [module README](src/evaluation/README.md) |
| RFC-08 | Hierarchical Authority Review | `src/architectures/hierarchical/` | [module README](src/architectures/hierarchical/README.md) |
| RFC-09 | Decentralized Consensus Review | `src/architectures/consensus/` | [module README](src/architectures/consensus/README.md) |
| RFC-10 | Export Service | `src/export/` | [module README](src/export/README.md) |
| RFC-11 | Research Workbench (backend) | `src/workbench/` | [module README](src/workbench/README.md) |

The Experiment Engine is the core runtime: it creates experiments, manages their
lifecycle, enforces idempotency, resolves and executes a review architecture,
validates the result, and stores the artifacts. The Research Evaluation Engine
(RFC-07) computes metrics from stored results, the Export Service (RFC-10)
serializes the resulting comparisons into CSV/JSON research-dataset strings, and
the Research Workbench (RFC-11) aggregates all of these into read-only,
presentation-ready view models for a researcher-facing UI (the UI itself is a
future RFC). The inline evaluation step in the experiment lifecycle is still an
injected no-op placeholder.

## Quick start

```bash
npm install
npm run check   # typecheck (tsc --strict) + unit tests (node:test)
```

Requires Node ≥ 22.18 (native TypeScript execution; no build step).
