import type { ReplayView } from "./models/replay-step.ts";
import type {
  ExperimentReadPort,
  ConversationHistoryReadPort,
} from "./ports.ts";

import { ReplayViewBuilder } from "./builders/replay-view-builder.ts";
import { ExperimentNotFoundError } from "../shared/errors.ts";

export interface ReplayServiceDependencies {
  readonly experiments: ExperimentReadPort;
  readonly conversations: ConversationHistoryReadPort;
  readonly builder?: ReplayViewBuilder;
}

/**
 * Read-only service that turns an experiment's {@link ConversationHistory} into
 * a {@link ReplayView} (RFC-11 §5). It orchestrates (verify experiment, fetch
 * conversation) and delegates the transform to the {@link ReplayViewBuilder}.
 *
 * No replay logic lives in the review architectures.
 */
export class ReplayService {
  private readonly experiments: ExperimentReadPort;
  private readonly conversations: ConversationHistoryReadPort;
  private readonly builder: ReplayViewBuilder;

  public constructor(deps: ReplayServiceDependencies) {
    this.experiments = deps.experiments;
    this.conversations = deps.conversations;
    this.builder = deps.builder ?? new ReplayViewBuilder();
  }

  public async getReplay(experimentId: string): Promise<ReplayView> {
    const experiment = await this.experiments.getById(experimentId);
    if (!experiment) {
      throw new ExperimentNotFoundError(
        `Experiment "${experimentId}" does not exist.`,
      );
    }

    const history = await this.conversations.getByExperimentId(experimentId);
    return this.builder.build({
      experimentId,
      architecture: experiment.architecture,
      history,
    });
  }
}
