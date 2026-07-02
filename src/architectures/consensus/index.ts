/**
 * Public barrel for the Decentralized Consensus review architecture (RFC-09).
 */
export {
  ConsensusArchitecture,
  createConsensusArchitecture,
} from "./consensus-architecture.ts";
export type { ConsensusArchitectureDependencies } from "./consensus-architecture.ts";

export { ConsensusCoordinator } from "./consensus-coordinator.ts";
export type {
  ConsensusCoordinatorDependencies,
  ConsensusRunResult,
} from "./consensus-coordinator.ts";
export { ConsensusSession } from "./consensus-session.ts";
export type { ConsensusState } from "./consensus-session.ts";
export { ConsensusSynthesizer } from "./consensus-synthesizer.ts";
export type { SynthesizeInput } from "./consensus-synthesizer.ts";

export {
  ConsensusSpecialist,
} from "./consensus-specialist.ts";
export type {
  IConsensusSpecialist,
  SpecialistVoteResult,
} from "./consensus-specialist.ts";

export type { IConsensusProtocol } from "./protocols/consensus-protocol.ts";
export { MajorityVoteConsensusProtocol } from "./protocols/majority-vote-protocol.ts";

export type { CandidateFinding } from "./models/candidate-finding.ts";
export type { ReviewVote, ConsensusVoteValue } from "./models/review-vote.ts";
export type {
  ConsensusDecision,
  ConsensusDecisionValue,
} from "./models/consensus-decision.ts";
export type { ConsensusReviewResult } from "./models/consensus-review-result.ts";
export type { ConsensusMetrics } from "./models/consensus-metrics.ts";
