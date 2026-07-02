import type { AgentRole } from "../../shared/agent.ts";

/** A specialist's vote on a candidate finding. */
export type ConsensusVoteValue = "accept" | "reject" | "revise";

export interface ReviewVote {
  readonly findingId: string;
  readonly reviewer: AgentRole;
  readonly vote: ConsensusVoteValue;
  readonly reason: string;
  readonly confidence: number;
}
