import type { LLMReviewRequest } from "../llm/models/llm-review-request.ts";
import { PromptBuilder, type BuildPromptInput, type PromptBuilderDependencies } from "../llm/prompts/prompt-builder.ts";

/**
 * Conditioned-sequential prompt builder (doc-17 follow-up). Injects a MUTABLE
 * "already reported --- find different issues" block via the `additionalContext`
 * seam. The driver sets {@link prior} before each sequential pass to the summary
 * of findings accumulated so far, so pass $j$ is steered toward the complement of
 * passes $1..j{-}1$ (explicit diversity / sampling-without-replacement). Empty
 * `prior` (pass 1) degrades to the base {@link PromptBuilder} verbatim.
 */
export class ConditionedPromptBuilder extends PromptBuilder {
  /** Set by the driver before each pass; empty ⇒ base generalist behaviour. */
  public prior = "";

  public constructor(deps: PromptBuilderDependencies) {
    super(deps);
  }

  public override build(input: BuildPromptInput): LLMReviewRequest {
    const p = this.prior.trim();
    if (!p) return super.build(input);
    const additionalContext = input.additionalContext
      ? `${input.additionalContext.trim()}\n\n${p}`
      : p;
    return super.build({ ...input, additionalContext });
  }
}

/** Render accumulated findings into the "already reported" directive for the next pass. */
export function priorDirective(findings: readonly { file: string; line: number; title?: string }[], cap = 40): string {
  if (findings.length === 0) return "";
  const lines = findings.slice(0, cap).map((f) => `- ${f.file}:${f.line}${f.title ? ` --- ${f.title}` : ""}`);
  return (
    "## Issues already reported by earlier reviewers\n" +
    "The following issues have ALREADY been reported. Do NOT repeat them. Review the " +
    "same diff and identify DIFFERENT, additional issues that were missed:\n" +
    lines.join("\n")
  );
}
