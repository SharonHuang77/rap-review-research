import type { SeverityLevel } from "../../models/finding.ts";

const SEVERITIES: readonly SeverityLevel[] = ["low", "medium", "high", "critical"];

/**
 * Normalize a dataset's raw severity string to a platform {@link SeverityLevel},
 * or `undefined` when absent/unrecognized. Case-insensitive; never invents a
 * value (an unknown severity becomes `undefined`, not a guessed level).
 */
export function normalizeSeverity(
  raw: string | undefined | null,
): SeverityLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const lower = raw.trim().toLowerCase();
  return SEVERITIES.find((s) => s === lower);
}
