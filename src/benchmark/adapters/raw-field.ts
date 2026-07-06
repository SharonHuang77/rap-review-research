/**
 * Small helpers for tolerantly reading raw benchmark rows.
 *
 * The exact upstream field names for Qodo PR-Review-Bench and SWE-PRBench are
 * not guaranteed to match one fixed spelling (datasets evolve, and different
 * exports use `file`/`path`/`file_path`, `line`/`line_number`/`start_line`,
 * etc.). Rather than hard-code one name, the adapters resolve a value from a
 * documented list of aliases so a real dataset maps without code changes.
 */

/** Return the first value that is neither `undefined` nor `null`. */
export function firstDefined<T>(
  ...values: Array<T | undefined | null>
): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

/** Coerce a numeric field that may arrive as a number or a numeric string. */
export function toLineNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Coerce a value that should be a string (numbers are stringified). */
export function toStringField(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
