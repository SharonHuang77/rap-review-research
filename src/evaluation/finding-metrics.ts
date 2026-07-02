import type { StoredExperimentResult } from "../storage/stored-models.ts";
import type { ReviewFinding } from "../models/finding.ts";
import type { ReviewQualityMetrics } from "./models/experiment-metrics.ts";

/**
 * Computes {@link ReviewQualityMetrics} from a stored experiment's findings:
 * finding count, per-severity counts, average confidence, and duplicate count.
 *
 * Pure and deterministic; never mutates the input. Localization accuracy
 * (synthetic mode) is out of scope for RFC-07 and left undefined.
 */
export class FindingMetricsCalculator {
  public calculate(result: StoredExperimentResult): ReviewQualityMetrics {
    const findings: ReviewFinding[] =
      result.validatedResult?.findings ?? result.findings;

    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;
    let confidenceSum = 0;
    const seen = new Set<string>();

    for (const finding of findings) {
      switch (finding.severity) {
        case "low":
          low += 1;
          break;
        case "medium":
          medium += 1;
          break;
        case "high":
          high += 1;
          break;
        case "critical":
          critical += 1;
          break;
      }
      confidenceSum += finding.confidence;
      seen.add(duplicateKey(finding));
    }

    const findingCount = findings.length;
    return {
      findingCount,
      lowSeverityCount: low,
      mediumSeverityCount: medium,
      highSeverityCount: high,
      criticalSeverityCount: critical,
      averageConfidence: findingCount === 0 ? 0 : confidenceSum / findingCount,
      duplicateFindingCount: findingCount - seen.size,
    };
  }
}

/** Two findings are duplicates when they share file, line, and title. */
function duplicateKey(finding: ReviewFinding): string {
  return `${finding.file}|${finding.line}|${finding.title.trim().toLowerCase()}`;
}
