// Proxy review-quality metrics for E3. Precision = independent-judge "genuine"
// rate; recall = leave-one-out pool coverage (see finding-pool.ts); f1 = HM.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";

/** Fraction of findings the judge rated `valid`. Empty set → 0. */
export function proxyPrecision(
  findings: readonly ReviewFinding[],
  verdicts: Readonly<Record<string, FindingVerdict>>,
): number {
  if (findings.length === 0) return 0;
  const valid = findings.filter((f) => verdicts[f.id] === "valid").length;
  return valid / findings.length;
}

/** Harmonic mean; 0 if either input is 0. */
export function proxyF1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
