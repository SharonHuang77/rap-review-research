import type { ReviewArchitecture } from "../../models/experiment.ts";
import type { ConversationHistory } from "../../architectures/shared/conversation-history.ts";
import type { ReplayStep, ReplayView } from "../models/replay-step.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

export interface ReplayBuildInput {
  readonly experimentId: string;
  readonly architecture?: ReviewArchitecture;
  /** `null` when the experiment produced no conversation (e.g. Agentless). */
  readonly history: ConversationHistory | null;
}

/**
 * Transforms a {@link ConversationHistory} into a chronological {@link ReplayView}
 * (RFC-11 §5, §7). Pure projection — it assigns nothing beyond the ordinal
 * `index` and copies each message's fields through. No replay logic lives in the
 * review architectures; it lives here.
 */
export class ReplayViewBuilder
  implements IWorkbenchViewBuilder<ReplayBuildInput, ReplayView>
{
  public build(input: ReplayBuildInput): ReplayView {
    const messages = input.history?.messages ?? [];
    const steps: ReplayStep[] = messages.map((message, index) => ({
      index,
      timestamp: message.timestamp,
      actor: message.from,
      to: message.to,
      messageType: message.type,
      content: message.content,
    }));

    return {
      experimentId: input.experimentId,
      architecture: input.architecture,
      stepCount: steps.length,
      steps,
    };
  }
}
