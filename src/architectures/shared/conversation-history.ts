import type { AgentMessage } from "./agent.ts";

/**
 * Structured record of every message exchanged during one multi-agent review.
 * Shared by Hierarchical and Consensus; becomes an experiment artifact.
 */
export class ConversationHistory {
  public readonly messages: AgentMessage[] = [];

  public record(message: AgentMessage): void {
    this.messages.push(message);
  }
}
