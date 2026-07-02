import type { PRSnapshot } from "../../models/snapshot.ts";
import type { LLMReviewRequest } from "../models/llm-review-request.ts";
import { PromptLoader } from "./prompt-loader.ts";
import { ContextBuilder } from "./context-builder.ts";

/** Identifies a role template, e.g. `{ category: "agentless", name: "system" }`. */
export interface PromptRole {
  readonly category: string;
  readonly name: string;
}

export interface BuildPromptInput {
  readonly promptVersion: string;
  readonly role: PromptRole;
  readonly snapshot: PRSnapshot;
  readonly rawDiff: string;
  readonly modelId: string;
  readonly temperature: number;
  readonly maxTokens: number;
  /** Optional expected output schema; rendered into the user prompt when present. */
  readonly jsonSchema?: object;
  /** Common template name under `<version>/common/`. Defaults to `review-instructions`. */
  readonly commonTemplate?: string;
  /**
   * Optional extra content appended to the user prompt (after the PR context,
   * before the schema). Used by multi-round architectures to inject
   * round-specific context (e.g. peer findings for revision, candidates for
   * voting) without a bespoke prompt builder.
   */
  readonly additionalContext?: string;
}

export interface PromptBuilderDependencies {
  readonly loader: PromptLoader;
  readonly contextBuilder: ContextBuilder;
}

/**
 * Composes a provider-independent {@link LLMReviewRequest} from version-controlled
 * templates and a PR snapshot.
 *
 * Prompt = common review instructions + role instructions (system)
 *        + PR context + optional expected JSON schema (user).
 *
 * This composition is shared by every architecture, guaranteeing a fair
 * comparison. Prompt text lives only in external templates — never in code.
 */
export class PromptBuilder {
  private readonly loader: PromptLoader;
  private readonly contextBuilder: ContextBuilder;

  public constructor(deps: PromptBuilderDependencies) {
    this.loader = deps.loader;
    this.contextBuilder = deps.contextBuilder;
  }

  public build(input: BuildPromptInput): LLMReviewRequest {
    const commonName = input.commonTemplate ?? "review-instructions";
    const common = this.loader.load(input.promptVersion, "common", commonName);
    const role = this.loader.load(
      input.promptVersion,
      input.role.category,
      input.role.name,
    );

    const systemPrompt = `${common.trim()}\n\n${role.trim()}`;
    const context = this.contextBuilder.build({
      snapshot: input.snapshot,
      rawDiff: input.rawDiff,
    });
    const withContext = input.additionalContext
      ? `${context}\n\n${input.additionalContext.trim()}`
      : context;
    const userPrompt = input.jsonSchema
      ? `${withContext}\n\n## Expected JSON schema\n\n\`\`\`json\n${JSON.stringify(
          input.jsonSchema,
          null,
          2,
        )}\n\`\`\``
      : withContext;

    return {
      systemPrompt,
      userPrompt,
      modelId: input.modelId,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      jsonSchema: input.jsonSchema,
    };
  }
}
