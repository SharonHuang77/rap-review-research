import type { ReviewFinding } from "../../../models/finding.ts";
import type { SpecialistReviewResult } from "./specialist-review-result.ts";

/**
 * The Manager's synthesized review, before conversion into RawReviewResult.
 */
export interface HierarchicalReviewResult {
  readonly managerSummary: string;
  readonly specialistResults: SpecialistReviewResult[];
  readonly mergedFindings: ReviewFinding[];
  readonly duplicateCount: number;
}
