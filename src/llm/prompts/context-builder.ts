import type { PRSnapshot } from "../../models/snapshot.ts";

export interface ContextInput {
  readonly snapshot: PRSnapshot;
  /** The raw unified diff (loaded from RawDiffStorage by the caller). */
  readonly rawDiff: string;
}

/**
 * Builds the deterministic PR-context block that is embedded into the user
 * prompt. It renders snapshot metadata, the changed-file summary, and the raw
 * unified diff — identical regardless of review architecture, to keep the
 * experiment fair.
 */
export class ContextBuilder {
  public build(input: ContextInput): string {
    const { snapshot, rawDiff } = input;

    const files = snapshot.changedFiles
      .map(
        (file) =>
          `- ${file.path} (${file.changeType}, +${file.additions}/-${file.deletions})`,
      )
      .join("\n");

    return [
      "# Pull Request",
      "",
      `Title: ${snapshot.title}`,
      `Description: ${snapshot.description ?? "(none)"}`,
      `Category: ${snapshot.category}`,
      `Complexity: ${snapshot.complexity}`,
      `Total changed lines: ${snapshot.totalChangedLines}`,
      "",
      "## Changed files",
      files,
      "",
      "## Unified diff",
      "```diff",
      rawDiff.trimEnd(),
      "```",
    ].join("\n");
  }
}
