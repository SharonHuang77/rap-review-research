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

The Experiment Engine is the core runtime: it creates experiments, manages their
lifecycle, enforces idempotency, resolves and executes a review architecture,
validates the result, and returns execution results. Storage, evaluation, the
dashboard, and the Hierarchical/Consensus architectures are future RFCs; the
evaluation step is still an injected no-op placeholder.

## Quick start

```bash
npm install
npm run check   # typecheck (tsc --strict) + unit tests (node:test)
```

Requires Node ≥ 22.18 (native TypeScript execution; no build step).
