import type { PRSnapshot } from "../models/snapshot.ts";
import type { LLMReviewRequest } from "../llm/models/llm-review-request.ts";
import { PromptBuilder, type BuildPromptInput, type PromptBuilderDependencies } from "../llm/prompts/prompt-builder.ts";
import { renderConventions } from "./project-conventions.ts";

export interface GroundingPromptBuilderDependencies extends PromptBuilderDependencies {
  /**
   * Resolve a snapshot to its repository key (e.g. "Ghost", "aspnetcore").
   * Returning `undefined` disables grounding for that snapshot, so the builder
   * degrades to the exact base behaviour — the ungrounded path stays byte-identical.
   */
  readonly resolveRepo: (snapshot: PRSnapshot) => string | undefined;
}

/**
 * The grounded-arm prompt builder (doc 13). It prepends the project's standing
 * conventions to the review input via the existing `additionalContext` seam,
 * leaving the frozen system/role templates and the ungrounded code path
 * untouched. When the repo is unknown or has no conventions it delegates verbatim
 * to {@link PromptBuilder}, so an ungrounded run built through this class is
 * indistinguishable from one built through the base builder.
 */
export class GroundingPromptBuilder extends PromptBuilder {
  private readonly resolveRepo: (snapshot: PRSnapshot) => string | undefined;

  public constructor(deps: GroundingPromptBuilderDependencies) {
    super(deps);
    this.resolveRepo = deps.resolveRepo;
  }

  public override build(input: BuildPromptInput): LLMReviewRequest {
    const repo = this.resolveRepo(input.snapshot);
    const conventions = repo ? renderConventions(repo) : "";
    if (!conventions) return super.build(input);
    const additionalContext = input.additionalContext
      ? `${input.additionalContext.trim()}\n\n${conventions}`
      : conventions;
    return super.build({ ...input, additionalContext });
  }
}
