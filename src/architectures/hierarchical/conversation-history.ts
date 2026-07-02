import type { AgentMessage } from "./messages.ts";

/**
 * Structured record of every message exchanged during one hierarchical review.
 *
 * Owned by the Manager Agent. Becomes an experiment artifact (and may later be
 * visualized in the dashboard).
 */
export class ConversationHistory {
  public readonly messages: AgentMessage[] = [];

  public record(message: AgentMessage): void {
    this.messages.push(message);
  }
}
