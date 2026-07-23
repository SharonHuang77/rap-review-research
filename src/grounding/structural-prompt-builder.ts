import type { PRSnapshot } from "../models/snapshot.ts";
import type { LLMReviewRequest } from "../llm/models/llm-review-request.ts";
import { PromptBuilder, type BuildPromptInput, type PromptBuilderDependencies } from "../llm/prompts/prompt-builder.ts";
import { buildStructuralContext, type StructuralOptions } from "./structural-context.ts";

/** Maps a snapshot to its CRAB repo + review-base commit, or undefined to disable. */
export interface CrabRef {
  readonly repo: string;
  readonly baseCommit: string;
}

export interface StructuralPromptBuilderDependencies extends PromptBuilderDependencies {
  /** Resolve a snapshot → CRAB ref. Undefined ⇒ diff-only (base behaviour). */
  readonly resolveRef: (snapshot: PRSnapshot) => CrabRef | undefined;
  readonly options?: StructuralOptions;
}

/**
 * Structural-retrieval prompt builder (doc-16). Prepends whole changed files +
 * their 1-hop local dependencies (retrieved from the repo at the review base) via
 * the same `additionalContext` seam the grounding builder uses. When the ref is
 * unknown it delegates verbatim to {@link PromptBuilder}, so the diff-only path is
 * byte-identical to the base builder (and to `crab-pilot.ts`).
 */
export class StructuralPromptBuilder extends PromptBuilder {
  private readonly resolveRef: (snapshot: PRSnapshot) => CrabRef | undefined;
  private readonly options?: StructuralOptions;

  public constructor(deps: StructuralPromptBuilderDependencies) {
    super(deps);
    this.resolveRef = deps.resolveRef;
    this.options = deps.options;
  }

  public override build(input: BuildPromptInput): LLMReviewRequest {
    const ref = this.resolveRef(input.snapshot);
    if (!ref) return super.build(input);
    const changedPaths = input.snapshot.changedFiles.map((f) => f.path);
    const ctx = buildStructuralContext(ref.repo, ref.baseCommit, changedPaths, this.options);
    if (!ctx.text) return super.build(input);
    const additionalContext = input.additionalContext
      ? `${input.additionalContext.trim()}\n\n${ctx.text}`
      : ctx.text;
    return super.build({ ...input, additionalContext });
  }
}
