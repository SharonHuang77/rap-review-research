import type { ReviewExecutionInput } from "../../models/review-result.ts";
import type { Clock } from "../../shared/clock.ts";
import type { Logger } from "../../shared/logger.ts";
import type { IConsensusSpecialist } from "./consensus-specialist.ts";
import type { ConsensusSynthesizer } from "./consensus-synthesizer.ts";
import type { IConsensusProtocol } from "./protocols/consensus-protocol.ts";
import type { ConsensusReviewResult } from "./models/consensus-review-result.ts";
import type { ConsensusState } from "./consensus-session.ts";

import { NoopLogger } from "../../shared/logger.ts";
import { ConsensusSession } from "./consensus-session.ts";

export interface ConsensusCoordinatorDependencies {
  readonly specialists: IConsensusSpecialist[];
  readonly synthesizer: ConsensusSynthesizer;
  readonly protocol: IConsensusProtocol;
  readonly clock: Clock;
  readonly logger?: Logger;
}

export interface ConsensusRunResult {
  readonly result: ConsensusReviewResult;
  readonly session: ConsensusSession;
}

/**
 * Orchestrates a consensus session's lifecycle. It creates the session,
 * initializes conversation history, invokes the configured protocol, records
 * lifecycle state, and returns the result.
 *
 * It is deliberately NON-authoritative: it never reviews code, implements
 * voting, runs discussion rounds, or decides consensus. That belongs to the
 * pluggable protocol and the deterministic synthesizer.
 */
export class ConsensusCoordinator {
  private readonly specialists: IConsensusSpecialist[];
  private readonly synthesizer: ConsensusSynthesizer;
  private readonly protocol: IConsensusProtocol;
  private readonly clock: Clock;
  private readonly logger: Logger;

  public constructor(deps: ConsensusCoordinatorDependencies) {
    this.specialists = deps.specialists;
    this.synthesizer = deps.synthesizer;
    this.protocol = deps.protocol;
    this.clock = deps.clock;
    this.logger = deps.logger ?? new NoopLogger();
  }

  public async run(input: ReviewExecutionInput): Promise<ConsensusRunResult> {
    const session = new ConsensusSession({
      input,
      specialists: this.specialists,
      synthesizer: this.synthesizer,
      clock: this.clock,
      logger: this.logger,
    });

    try {
      const result = await this.protocol.execute(session);
      session.transition("completed");
      return { result, session };
    } catch (error) {
      session.transition("failed");
      throw error;
    }
  }

  /** Convenience accessor for the state list of the most recent session. */
  public statesOf(session: ConsensusSession): ConsensusState[] {
    return session.states;
  }
}
