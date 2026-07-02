import type { IReviewArchitecture } from "../review-architecture.ts";
import type { ReviewArchitecture } from "../../models/experiment.ts";
import type {
  ReviewExecutionInput,
  RawReviewResult,
} from "../../models/review-result.ts";
import type { ILLMProvider } from "../../llm/provider/llm-provider.ts";
import type { PromptBuilder, PromptRole } from "../../llm/prompts/prompt-builder.ts";
import type { RawDiffStorage } from "../../storage/raw-diff-storage.ts";
import type { LLMConfig } from "../../config/llm.ts";
import type { Logger } from "../../shared/logger.ts";

import { LLM_CONFIG } from "../../config/llm.ts";
import { NoopLogger } from "../../shared/logger.ts";
import { mapToRawReviewResult } from "./agentless-result-mapper.ts";

/** The Agentless role template (`templates/<version>/agentless/system.md`). */
const AGENTLESS_ROLE: PromptRole = { category: "agentless", name: "system" };

export interface AgentlessArchitectureDependencies {
  /** LLM provider — Agentless depends only on this, never on Bedrock directly. */
  readonly provider: ILLMProvider;
  /** Shared prompt builder (RFC-03.5). */
  readonly promptBuilder: PromptBuilder;
  /** Raw-diff storage port — supplies the diff text the prompt needs. */
  readonly rawDiffStorage: RawDiffStorage;
  /** Inference parameters (temperature/maxTokens). Defaults to `LLM_CONFIG`. */
  readonly config?: LLMConfig;
  readonly logger?: Logger;
  /** Override the role template (defaults to the Agentless system template). */
  readonly role?: PromptRole;
}

/**
 * The Agentless review architecture — the baseline control condition.
 *
 * Reviews one PR snapshot with a single LLM provider call: build prompt →
 * `ILLMProvider.review()` once → map to `RawReviewResult` (`llmCalls = 1`).
 *
 * Responsibilities: build the request via the shared `PromptBuilder`, make one
 * provider call, and map the response.
 * Non-responsibilities: it does not validate JSON, store findings, access
 * domain repositories, call Bedrock directly, or retry. Provider errors
 * propagate to the Experiment Engine, which owns retry policy.
 */
export class AgentlessArchitecture implements IReviewArchitecture {
  public readonly name: ReviewArchitecture = "agentless";

  private readonly provider: ILLMProvider;
  private readonly promptBuilder: PromptBuilder;
  private readonly rawDiffStorage: RawDiffStorage;
  private readonly config: LLMConfig;
  private readonly logger: Logger;
  private readonly role: PromptRole;

  public constructor(deps: AgentlessArchitectureDependencies) {
    this.provider = deps.provider;
    this.promptBuilder = deps.promptBuilder;
    this.rawDiffStorage = deps.rawDiffStorage;
    this.config = deps.config ?? LLM_CONFIG;
    this.logger = deps.logger ?? new NoopLogger();
    this.role = deps.role ?? AGENTLESS_ROLE;
  }

  public async execute(
    input: ReviewExecutionInput,
  ): Promise<RawReviewResult> {
    const rawDiff = await this.rawDiffStorage.getRawDiff(
      input.snapshot.rawDiffS3Key,
    );

    const request = this.promptBuilder.build({
      promptVersion: input.promptVersion,
      role: this.role,
      snapshot: input.snapshot,
      rawDiff,
      modelId: input.modelVersion,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // Exactly one provider call. No retry here — that is the engine's job.
    const response = await this.provider.review(request);
    const result = mapToRawReviewResult(response);

    this.logger.info("Agentless review completed", {
      experimentId: input.experimentId,
      snapshotId: input.snapshot.snapshotId,
      architecture: this.name,
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    });

    return result;
  }
}
