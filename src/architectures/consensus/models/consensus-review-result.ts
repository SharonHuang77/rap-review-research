import type { ReviewFinding } from "../../../models/finding.ts";
import type { SpecialistReviewResult } from "../../shared/specialist-review-result.ts";
import type { CandidateFinding } from "./candidate-finding.ts";
import type { ReviewVote } from "./review-vote.ts";
import type { ConsensusDecision } from "./consensus-decision.ts";
import type { ConsensusMetrics } from "./consensus-metrics.ts";

/**
 * The full result of a consensus session, before conversion into
 * RawReviewResult. Only `acceptedFindings` become the final findings.
 */
export interface ConsensusReviewResult {
  readonly summary: string;
  readonly independentResults: SpecialistReviewResult[];
  readonly revisedResults: SpecialistReviewResult[];
  readonly candidateFindings: CandidateFinding[];
  readonly votes: ReviewVote[];
  readonly decisions: ConsensusDecision[];
  readonly acceptedFindings: ReviewFinding[];
  readonly consensusMetrics: ConsensusMetrics;
}
