import type { LLMReviewRequest } from "../llm/models/llm-review-request.ts";
import { PromptBuilder, type BuildPromptInput, type PromptBuilderDependencies } from "../llm/prompts/prompt-builder.ts";

/** A fixed error-type focus injected into every review this builder produces. */
export interface TypeSpecialistPromptBuilderDependencies extends PromptBuilderDependencies {
  /** The focus directive (empty ⇒ base generalist behaviour, byte-identical). */
  readonly focus: string;
}

/**
 * Error-type-specialist prompt builder (doc-17). Prepends a "report ONLY <type>
 * issues" directive via the same `additionalContext` seam the grounding builder
 * uses — leaving the frozen system/role templates untouched. One instance per
 * type; the team is the union of several type-specialist passes. Empty focus
 * degrades to the base {@link PromptBuilder}, so a generalist built through this
 * class is indistinguishable from the base builder.
 */
export class TypeSpecialistPromptBuilder extends PromptBuilder {
  private readonly focus: string;

  public constructor(deps: TypeSpecialistPromptBuilderDependencies) {
    super(deps);
    this.focus = deps.focus.trim();
  }

  public override build(input: BuildPromptInput): LLMReviewRequest {
    if (!this.focus) return super.build(input);
    const additionalContext = input.additionalContext
      ? `${input.additionalContext.trim()}\n\n${this.focus}`
      : this.focus;
    return super.build({ ...input, additionalContext });
  }
}

/** The two error types Qodo's ground truth actually covers (see doc-17). */
export const TYPE_FOCI: Record<string, string> = {
  convention:
    "## Review focus: CONVENTIONS ONLY\n" +
    "Report ONLY style, formatting, naming, and project-convention violations — " +
    "e.g. quote style, semicolons, indentation, naming suffixes (like an `Async` " +
    "suffix), namespace/brace style, framework/config conventions (test framework, " +
    "package manager, strict-typing, import ordering). Do NOT report functional or " +
    "logic bugs; another reviewer covers those.",
  functional:
    "## Review focus: FUNCTIONAL CORRECTNESS ONLY\n" +
    "Report ONLY functional-correctness defects — logic errors, wrong behaviour, " +
    "missed edge cases, null/exception/error handling, incorrect data flow, resource " +
    "or state mistakes. Do NOT report style or convention issues; another reviewer " +
    "covers those.",
};
