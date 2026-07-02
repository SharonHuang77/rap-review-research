import type { AgentRole, AgentMessageType } from "../../architectures/shared/agent.ts";
import type { ReviewArchitecture } from "../../models/experiment.ts";

/**
 * One chronological step of a multi-agent conversation replay (RFC-11 §7).
 *
 * Projected directly from an {@link AgentMessage} in a {@link ConversationHistory};
 * `actor` is the message's `from` and `messageType` is its `type`. `index` and
 * `to` are additive fields that support the timeline navigation described in
 * RFC-11 §11 (next/previous, jump-to-vote) — they do not change the RFC's
 * required shape.
 */
export interface ReplayStep {
  /** Zero-based ordinal, in conversation order — enables next/previous/jump. */
  readonly index: number;
  readonly timestamp: string;
  readonly actor: AgentRole;
  /** Recipient of the message (additive; useful for filtering by agent). */
  readonly to: AgentRole;
  readonly messageType: AgentMessageType;
  readonly content: unknown;
}

/**
 * The full replay of one experiment's conversation. Read-only; generated
 * entirely from {@link ConversationHistory}. Architectures with no conversation
 * (e.g. Agentless) yield an empty `steps` array rather than an error.
 */
export interface ReplayView {
  readonly experimentId: string;
  readonly architecture?: ReviewArchitecture;
  readonly stepCount: number;
  readonly steps: ReplayStep[];
}
