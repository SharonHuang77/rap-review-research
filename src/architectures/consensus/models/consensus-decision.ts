import type { ReviewVote } from "./review-vote.ts";

export type ConsensusDecisionValue = "accepted" | "rejected" | "needs-review";

/** The consensus outcome for one candidate finding. */
export interface ConsensusDecision {
  readonly candidateId: string;
  readonly decision: ConsensusDecisionValue;
  readonly votes: ReviewVote[];
  readonly acceptedVoteCount: number;
  readonly rejectedVoteCount: number;
}
