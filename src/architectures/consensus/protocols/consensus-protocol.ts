import type { ConsensusSession } from "../consensus-session.ts";
import type { ConsensusReviewResult } from "../models/consensus-review-result.ts";

/**
 * Pluggable consensus algorithm. The protocol owns the complete algorithm
 * (review rounds, exchange, revision, voting, synthesis); the Coordinator owns
 * orchestration and lifecycle. New protocols (Debate, Delphi, MultiRound) can be
 * added without modifying the Coordinator.
 */
export interface IConsensusProtocol {
  execute(session: ConsensusSession): Promise<ConsensusReviewResult>;
}
