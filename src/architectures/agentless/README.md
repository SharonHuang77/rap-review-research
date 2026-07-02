# Agentless Review Architecture (RFC-04)

Agentless is the **first real review architecture** and the **baseline / control
condition** for the experiment: one PR snapshot, one prompt, **one** LLM provider
call, one raw result. Hierarchical Authority and Decentralized Peer Consensus are
compared against it.

> Spec: `docs/implementaion/04-agentless.md` · Framework: [../README.md](../README.md) · LLM layer: [../../llm/README.md](../../llm/README.md)

## Flow

```
Experiment Engine → ArchitectureRegistry → AgentlessArchitecture
  → RawDiffStorage.getRawDiff()          (fetch the diff text)
  → PromptBuilder.build()                (common + agentless role + PR context)
  → ILLMProvider.review()  ×1            (MockProvider / BedrockProvider)
  → mapToRawReviewResult()               (llmCalls = 1)
```

## Files

```
src/architectures/agentless/
├── agentless-architecture.ts    # AgentlessArchitecture implements IReviewArchitecture
├── agentless-result-mapper.ts   # LLMReviewResponse -> RawReviewResult (no validation)
├── index.ts
└── README.md
```
Prompt template lives in the LLM layer: `src/llm/prompts/templates/v1/agentless/system.md`.

## Contract

- Implements `IReviewArchitecture` (`name = "agentless"`).
- Depends only on `ILLMProvider` — **never Bedrock directly**.
- Makes **exactly one** provider call; **no internal retry** (the Experiment
  Engine owns retry policy). Typed provider errors propagate unchanged.
- Returns `RawReviewResult` with `llmCalls = 1` and the execution metrics
  (`inputTokens`, `outputTokens`, `latencyMs`, `estimatedCostUsd`) taken from the
  provider response.
- **Does not validate JSON**, store findings, or access domain repositories.

### Dependencies (constructor DI)

| Dep | Purpose |
| --- | --- |
| `provider: ILLMProvider` | the single LLM call |
| `promptBuilder: PromptBuilder` | shared prompt composition (RFC-03.5) |
| `rawDiffStorage: RawDiffStorage` | supplies the diff text for the prompt |
| `config?: LLMConfig` | temperature / maxTokens (defaults to `LLM_CONFIG`) |
| `logger?: Logger` | structured logging (defaults to no-op) |

`modelId` for the call comes from `ReviewExecutionInput.modelVersion` (the
experiment's controlled variable), not from a hardcoded value. `promptVersion`
selects the template directory (`templates/<promptVersion>/…`), so pass `"v1"`.

## Result mapping — no validation

`agentless-result-mapper.ts` does a **tolerant, best-effort** surfacing of
`summary`/`findings` from JSON-shaped output. It never throws and never enforces
a schema; the unmodified model text is kept in `rawOutput` for the Validation
Engine (RFC-05) to validate later.

## Demo

```bash
npm run demo:agentless      # sample.diff → snapshot → engine → Agentless → RawReviewResult (mock provider)
```
No Bedrock credentials required. (A separate live check is `npm run smoke:bedrock`.)

## Tests

`tests/unit/agentless-architecture.test.ts` (unit, MockProvider) and
`tests/unit/agentless-integration.test.ts` (through registry + engine). All
provider calls are mocked — **no Bedrock calls occur in tests**.

## Notes / decisions

- **`RawReviewResult.llmCalls`** was added (alongside `messageCount`) per RFC-04
  §8. RFC-01's engine-metrics list mandates both "number of LLM calls" and
  "message count", so the field is additive rather than a replacement — no
  existing contract was broken. (Flagged for doc reconciliation.)
- **Raw diff via `RawDiffStorage`.** `ReviewExecutionInput` carries the snapshot
  (which holds `rawDiffS3Key`), not the diff text. Per the RFC-03.5 `ContextBuilder`
  contract ("the caller fetches the raw diff"), Agentless reads it from the
  injected `RawDiffStorage` **storage port** — not a domain repository, so the
  "no direct repository access" rule holds.
