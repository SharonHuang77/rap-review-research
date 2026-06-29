import { test } from "node:test";
import assert from "node:assert/strict";

import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockProvider,
  buildConverseRequest,
} from "../../src/llm/provider/bedrock-provider.ts";
import type {
  BedrockConverseClient,
} from "../../src/llm/provider/bedrock-provider.ts";
import type { ILLMProvider } from "../../src/llm/provider/llm-provider.ts";
import type { LLMReviewRequest } from "../../src/llm/models/llm-review-request.ts";
import {
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../src/llm/errors.ts";

const REQUEST: LLMReviewRequest = {
  systemPrompt: "SYS",
  userPrompt: "USER",
  modelId: "model-x",
  temperature: 0,
  maxTokens: 512,
};

/** Build a fake Converse response (cast to the SDK output type). */
function output(opts: {
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): ConverseCommandOutput {
  return {
    output: {
      message: {
        role: "assistant",
        content: opts.text === undefined ? [] : [{ text: opts.text }],
      },
    },
    usage: {
      inputTokens: opts.inputTokens ?? 0,
      outputTokens: opts.outputTokens ?? 0,
      totalTokens: (opts.inputTokens ?? 0) + (opts.outputTokens ?? 0),
    },
    metrics: { latencyMs: opts.latencyMs ?? 0 },
    $metadata: {},
  } as unknown as ConverseCommandOutput;
}

/** A fake client that returns a canned response and records the command. */
function clientReturning(out: ConverseCommandOutput): {
  client: BedrockConverseClient;
  sent: unknown[];
} {
  const sent: unknown[] = [];
  return {
    sent,
    client: {
      send: async (command) => {
        sent.push(command);
        return out;
      },
    },
  };
}

test("buildConverseRequest maps the review request to a valid Converse body", () => {
  const body = buildConverseRequest(REQUEST);

  assert.equal(body.modelId, "model-x");
  assert.deepEqual(body.system, [{ text: "SYS" }]);
  assert.equal(body.messages?.length, 1);
  assert.equal(body.messages?.[0]?.role, "user");
  assert.deepEqual(body.messages?.[0]?.content, [{ text: "USER" }]);
  assert.equal(body.inferenceConfig?.temperature, 0);
  assert.equal(body.inferenceConfig?.maxTokens, 512);
});

test("review maps a Converse response into LLMReviewResponse with metrics", async () => {
  const { client, sent } = clientReturning(
    output({ text: "Looks good", inputTokens: 1000, outputTokens: 500, latencyMs: 1234 }),
  );
  const provider: ILLMProvider = new BedrockProvider({
    client,
    pricing: { "model-x": { inputPer1kUsd: 0.001, outputPer1kUsd: 0.002 } },
  });

  const response = await provider.review(REQUEST);

  assert.equal(response.text, "Looks good");
  assert.equal(response.modelId, "model-x");
  assert.equal(response.inputTokens, 1000);
  assert.equal(response.outputTokens, 500);
  assert.equal(response.latencyMs, 1234);
  // 1000/1000*0.001 + 500/1000*0.002 = 0.001 + 0.001
  assert.equal(response.estimatedCostUsd, 0.002);
  assert.equal(sent.length, 1); // exactly one Converse call
});

test("an empty response is rejected as a provider response error", async () => {
  const { client } = clientReturning(output({ text: undefined }));
  const provider = new BedrockProvider({ client });
  await assert.rejects(() => provider.review(REQUEST), ProviderResponseError);
});

test("throttling maps to ProviderRateLimitError", async () => {
  const client: BedrockConverseClient = {
    send: async () => {
      throw Object.assign(new Error("slow down"), {
        name: "ThrottlingException",
      });
    },
  };
  const provider = new BedrockProvider({ client });
  await assert.rejects(() => provider.review(REQUEST), ProviderRateLimitError);
});

test("access denied maps to ProviderAuthenticationError", async () => {
  const client: BedrockConverseClient = {
    send: async () => {
      throw Object.assign(new Error("no access"), {
        name: "AccessDeniedException",
      });
    },
  };
  const provider = new BedrockProvider({ client });
  await assert.rejects(
    () => provider.review(REQUEST),
    ProviderAuthenticationError,
  );
});
