import { JSONExtractionError } from "./validation-errors.ts";

export interface ExtractResult {
  readonly json: string;
  readonly actions: string[];
}

/**
 * Extracts the first balanced JSON object from text, ignoring any leading or
 * trailing commentary. Brace matching is string- and escape-aware so braces
 * inside string values do not confuse it.
 *
 * @throws JSONExtractionError when no balanced object is present.
 */
export class JSONExtractor {
  public extract(text: string): ExtractResult {
    const start = text.indexOf("{");
    if (start === -1) {
      throw new JSONExtractionError("No JSON object found in output.");
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const json = text.slice(start, i + 1);
          const actions: string[] = [];
          if (start > 0 || i + 1 < text.length) {
            actions.push("extracted JSON object from surrounding text");
          }
          return { json, actions };
        }
      }
    }

    throw new JSONExtractionError("Unbalanced JSON object in output.");
  }
}
