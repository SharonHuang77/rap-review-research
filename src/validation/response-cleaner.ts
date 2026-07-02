export interface CleanResult {
  readonly text: string;
  readonly actions: string[];
}

/**
 * Removes Markdown code fences and surrounding whitespace from LLM output while
 * preserving the JSON content. It does not extract or parse — that is the
 * {@link JSONExtractor}'s job.
 */
export class ResponseCleaner {
  public clean(input: string): CleanResult {
    const actions: string[] = [];
    let text = input;

    // Strip ```json / ``` fence markers (JSON never contains triple backticks).
    const withoutFences = text.replace(/```[a-zA-Z0-9]*/g, "");
    if (withoutFences !== text) {
      actions.push("removed markdown code fences");
      text = withoutFences;
    }

    const trimmed = text.trim();
    if (trimmed !== text) {
      actions.push("trimmed surrounding whitespace");
    }

    return { text: trimmed, actions };
  }
}
