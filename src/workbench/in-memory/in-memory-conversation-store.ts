import type { ConversationHistory } from "../../architectures/shared/conversation-history.ts";
import type { ConversationHistoryReadPort } from "../ports.ts";

/**
 * In-memory {@link ConversationHistoryReadPort}. Seeded via {@link record} with
 * the {@link ConversationHistory} artifact captured from a multi-agent run.
 * Returns `null` for experiments with no recorded conversation (e.g. Agentless).
 */
export class InMemoryConversationStore implements ConversationHistoryReadPort {
  private readonly byExperimentId = new Map<string, ConversationHistory>();

  public record(experimentId: string, history: ConversationHistory): void {
    this.byExperimentId.set(experimentId, history);
  }

  public async getByExperimentId(
    experimentId: string,
  ): Promise<ConversationHistory | null> {
    return this.byExperimentId.get(experimentId) ?? null;
  }
}
