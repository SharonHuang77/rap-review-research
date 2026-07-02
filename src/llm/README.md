# Shared LLM Architecture (RFC-03.5)

Provider-independent LLM infrastructure shared by every review architecture
(Agentless, Hierarchical, Consensus). Review architectures **never** talk to a
provider SDK directly — they go through this layer:

```
Review Architecture → PromptBuilder → ILLMProvider → BedrockProvider → Claude (Bedrock)
                                                    → MockProvider (tests/offline)
```

> Spec: `docs/implementaion/03.5-lln-architecture` · Framework: `docs/implementaion/03-review-architecture-framework.md`

This is shared **infrastructure**, not a review architecture. No review logic,
validation, storage, or orchestration lives here.

---

## Folder structure

```
src/llm/
├── models/
│   ├── llm-review-request.ts     # LLMReviewRequest (provider-independent input)
│   ├── llm-review-response.ts    # LLMReviewResponse (text + metrics)
│   ├── llm-usage.ts              # LLMUsage (token accounting)
│   └── index.ts
├── prompts/
│   ├── prompt-loader.ts          # PromptLoader — reads versioned .md templates
│   ├── context-builder.ts        # ContextBuilder — renders PR snapshot + diff
│   ├── prompt-builder.ts         # PromptBuilder — composes an LLMReviewRequest
│   ├── index.ts
│   └── templates/v1/
│       ├── common/review-instructions.md
│       ├── agentless/system.md
│       ├── hierarchical/manager.md
│       └── consensus/specialist.md
├── provider/
│   ├── llm-provider.ts           # ILLMProvider
│   ├── mock-provider.ts          # MockProvider (no network)
│   ├── bedrock-provider.ts       # BedrockProvider (AWS SDK v3, Converse API)
│   └── index.ts
├── errors.ts                     # typed provider/prompt errors
└── index.ts                      # public barrel

src/config/llm.ts                 # LLM_CONFIG, pricing, estimateCostUsd
```

(File names are kebab-case to match the codebase convention and the development
guidelines; the spec's structure diagram used PascalCase illustratively.)

## Public interfaces

```ts
interface ILLMProvider {
  review(request: LLMReviewRequest): Promise<LLMReviewResponse>;
}

interface LLMReviewRequest {
  systemPrompt: string; userPrompt: string;
  modelId: string; temperature: number; maxTokens: number;
  jsonSchema?: object;
}

interface LLMReviewResponse {
  text: string; modelId: string;
  inputTokens: number; outputTokens: number;
  latencyMs: number; estimatedCostUsd: number;
}

interface LLMUsage { inputTokens: number; outputTokens: number; totalTokens: number; }
```

Plus: `PromptLoader`, `ContextBuilder`, `PromptBuilder`, `MockProvider`,
`BedrockProvider`, `buildConverseRequest`, and typed errors
(`ProviderAuthenticationError`, `ProviderTimeoutError`, `ProviderRateLimitError`,
`ProviderResponseError`, `PromptNotFoundError`).

## Prompt composition

```
system = common/review-instructions  +  <role template>
user   = PR context (ContextBuilder)  +  optional "Expected JSON schema"
```

Templates are external, version-controlled Markdown (`templates/v1/…`). Add a
`v2/` folder for a new prompt version; existing versions become immutable after
the prompt-freeze milestone. Prompts are never hardcoded in source.

## Provider / Bedrock

- **AWS SDK v3** (`@aws-sdk/client-bedrock-runtime`), **Converse API**
  (`ConverseCommand`). `buildConverseRequest()` maps an `LLMReviewRequest` to
  `{ modelId, system:[{text}], messages:[{role:"user",content:[{text}]}], inferenceConfig:{temperature,maxTokens} }`.
- **Credentials**: the real client is created with only `{ region }`, so the AWS
  SDK **default credential provider chain** supplies credentials. None are read,
  logged, or stored in code.
- **Metrics captured**: latency (from `response.metrics.latencyMs`, falling back
  to measured wall-clock), input/output tokens (`response.usage`), estimated
  cost (`estimateCostUsd`), and model id.
- **Errors**: AWS exceptions are mapped by name to the typed errors above.
- **Testability**: the client is injectable (`BedrockConverseClient`), so unit
  tests run with a fake — **no real Bedrock calls** occur in tests.

## Configuration (`src/config/llm.ts`)

| Env var | Default | Meaning |
| ------- | ------- | ------- |
| `LLM_PROVIDER` | `bedrock` | `bedrock` or `mock` |
| `LLM_REGION` / `AWS_REGION` | `ca-central-1` | Bedrock region |
| `LLM_DEFAULT_MODEL` | `anthropic.claude-3-5-sonnet-20240620-v1:0` | model id (confirm the approved model; an inference-profile id may be required for cross-region access) |
| `LLM_TEMPERATURE` | `0` | sampling temperature |
| `LLM_MAX_TOKENS` | `4096` | max output tokens |

`LLM_PRICING` is an approximate per-1K-token table used for cost estimation
(research tracking, not billing); unknown models estimate `0`.

## Usage

```ts
import { PromptLoader, ContextBuilder, PromptBuilder, BedrockProvider, MockProvider }
  from "./src/llm/index.ts";
import { LLM_CONFIG } from "./src/config/llm.ts";

const builder = new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() });
const request = builder.build({
  promptVersion: "v1",
  role: { category: "agentless", name: "system" },
  snapshot, rawDiff,
  modelId: LLM_CONFIG.defaultModel,
  temperature: LLM_CONFIG.temperature,
  maxTokens: LLM_CONFIG.maxTokens,
});

const provider = LLM_CONFIG.provider === "mock" ? new MockProvider() : new BedrockProvider();
const response = await provider.review(request);
```

## Build & test

```bash
npm run check   # tsc --strict + node:test (all AWS calls mocked)
```

See the [RFC-01 README](../engines/experiment/README.md#build--test-workflow)
for the native-TypeScript / `node:test` workflow.

---

## Live Bedrock smoke test

`npm run smoke:bedrock` makes **one** tiny real Converse call through
`BedrockProvider` to confirm local AWS setup. It uses the AWS SDK default
credential provider chain (no keys in code) and is **not** part of `npm test` /
`npm run check`.

One-time / per-session setup:

```bash
# 1. Configure credentials (pick one)
aws configure sso           # SSO (recommended); then: aws sso login --profile <p>
aws configure               # or static IAM credentials

export AWS_PROFILE=<profile>       # if using SSO/named profile
export AWS_REGION=ca-central-1     # or set LLM_REGION

# 2. Verify identity
aws sts get-caller-identity

# 3. Run the smoke test
npm run smoke:bedrock
```

Requirements: Bedrock **model access** enabled for the target Claude Sonnet
model **in the same region** (Bedrock console → Model access), and the IAM
principal must allow `bedrock:InvokeModel`.

### Troubleshooting

| Symptom (script output) | Likely cause | Fix |
| ----------------------- | ------------ | --- |
| `ProviderAuthenticationError` (AccessDenied / UnrecognizedClient / ExpiredToken) | No/expired credentials, or missing `bedrock:InvokeModel` | `aws sso login` (or `aws configure`); confirm `aws sts get-caller-identity`; add `bedrock:InvokeModel` to the principal |
| `ProviderResponseError` mentioning **ValidationException** / "invocation ... with on-demand throughput isn't supported" | The model requires a **cross-region inference profile**, not a bare model id | Use the inference-profile id (see below) via `LLM_DEFAULT_MODEL` |
| `ProviderResponseError` mentioning model access / "You don't have access to the model" | Model access not enabled in this region | Enable it in Bedrock → Model access, in the **same region** as `LLM_REGION`/`AWS_REGION` |
| `ProviderResponseError` "model identifier is invalid" | Wrong/typo'd model id, or model not offered in this region | List valid ids (below) and set `LLM_DEFAULT_MODEL` |
| `ProviderRateLimitError` (ThrottlingException) | Throttled | Wait and retry |
| `ProviderTimeoutError` | Network/VPN | Check connectivity and retry |

**Cross-region inference profiles.** Newer Claude models in some regions are
only invokable through an inference profile (its id is region-prefixed, e.g.
`apac.` / `us.` / `eu.` …), not the bare `anthropic.claude-…` id. Passing the
bare id then yields a `ValidationException` (surfaced here as
`ProviderResponseError`). List what your region/account can invoke and pass it
explicitly:

```bash
# On-demand base models
aws bedrock list-foundation-models --region "$AWS_REGION" \
  --by-provider anthropic --query "modelSummaries[].modelId" --output table

# Inference profiles (use the inferenceProfileId if a base id is rejected)
aws bedrock list-inference-profiles --region "$AWS_REGION" \
  --query "inferenceProfileSummaries[].inferenceProfileId" --output table

# Then run against the approved id/profile:
LLM_DEFAULT_MODEL=<model-id-or-inference-profile-id> npm run smoke:bedrock
```

`list-foundation-models` / `list-inference-profiles` require the
`bedrock:ListFoundationModels` / `bedrock:ListInferenceProfiles` permissions
(control-plane), separate from `bedrock:InvokeModel` (runtime).

---

## Design decisions

1. **Provider behind an interface.** Architectures depend only on
   `ILLMProvider`; `BedrockProvider` and `MockProvider` are interchangeable, and
   a future provider needs no architecture changes.
2. **Injectable Bedrock client.** `BedrockProvider` accepts a structural
   `BedrockConverseClient`, so tests inject a fake and never hit the network;
   the default client uses the AWS SDK credential chain.
3. **Prompts are data, not code.** External, versioned Markdown templates loaded
   by `PromptLoader`; `PromptBuilder` composes them identically for every
   architecture to keep experiments fair.
4. **Config centralised & env-driven.** Model id, region, and inference
   parameters live in `src/config/llm.ts`; architectures never hardcode them.
5. **`modelId` added to `LLMReviewResponse`.** The spec's §8 interface omits it
   but §14 requires the model id among captured metrics; including it on the
   response keeps all five metrics together. (See compliance report.)
6. **`jsonSchema` is advisory here.** It is rendered into the prompt by
   `PromptBuilder` and carried on the request; the Converse call does not use
   tool-based structured output (validation is a future RFC).
