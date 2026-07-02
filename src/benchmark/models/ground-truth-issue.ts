import type { SeverityLevel } from "../../models/finding.ts";

/**
 * A labeled defect in a benchmark instance's ground truth — the "correct answer"
 * a review architecture is expected to surface.
 *
 * Location is a line *range* (`lineStart`..`lineEnd`, inclusive) because
 * benchmark labels typically annotate a span. `category`/`severity` are optional
 * because not every dataset provides them (e.g. SWE-PRBench human comments carry
 * neither); matching that depends on them is skipped when absent.
 */
export interface GroundTruthIssue {
  readonly id: string;
  readonly file: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly category?: string;
  readonly severity?: SeverityLevel;
  readonly title?: string;
  readonly description?: string;
}
