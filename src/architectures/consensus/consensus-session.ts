import type { AgentRole, AgentMessageType } from "../shared/agent.ts";
import type { ReviewExecutionInput } from "../../models/review-result.ts";
import type { Clock } from "../../shared/clock.ts";
import type { Logger } from "../../shared/logger.ts";
import type { IConsensusSpecialist } from "./consensus-specialist.ts";
import type { ConsensusSynthesizer } from "./consensus-synthesizer.ts";

import { ConversationHistory } from "../shared/conversation-history.ts";
import { NoopLogger } from "../../shared/logger.ts";

/** States of a consensus session (RFC-09 §17). */
export type ConsensusState =
  | "created"
  | "independent-review"
  | "exchange"
  | "revision"
  | "voting"
  | "synthesizing"
  | "completed"
  | "failed";

export interface ConsensusSessionDependencies {
  readonly input: ReviewExecutionInput;
  readonly specialists: IConsensusSpecialist[];
  readonly synthesizer: ConsensusSynthesizer;
  readonly clock: Clock;
  readonly logger?: Logger;
}

/**
 * The shared state object for one consensus run. Created and owned by the
 * ConsensusCoordinator; advanced by the protocol. Holds the input, specialists,
 * synthesizer, conversation history, and lifecycle state — but no consensus
 * decision logic (that lives in the protocol/synthesizer).
 */
export class ConsensusSession {
  public readonly input: ReviewExecutionInput;
  public readonly specialists: IConsensusSpecialist[];
  public readonly synthesizer: ConsensusSynthesizer;
  public readonly conversation = new ConversationHistory();

  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly stateLog: ConsensusState[] = ["created"];

  public constructor(deps: ConsensusSessionDependencies) {
    this.input = deps.input;
    this.specialists = deps.specialists;
    this.synthesizer = deps.synthesizer;
    this.clock = deps.clock;
    this.logger = deps.logger ?? new NoopLogger();
  }

  public get states(): ConsensusState[] {
    return [...this.stateLog];
  }

  public transition(state: ConsensusState): void {
    this.stateLog.push(state);
    this.logger.info(`Consensus → ${state}`, { architecture: "consensus" });
  }

  public send(
    from: AgentRole,
    to: AgentRole,
    type: AgentMessageType,
    content: unknown,
  ): void {
    this.conversation.record({
      from,
      to,
      type,
      content,
      timestamp: this.clock.nowIso(),
    });
  }
}
