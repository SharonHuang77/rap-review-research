import type {
  RunExperimentInput,
  RunExperimentResult,
  ExperimentStatus,
} from "../../models/experiment.ts";
import type { IExperimentEngine } from "../../engines/experiment/experiment-engine.ts";
import type { Logger } from "../../shared/logger.ts";

/**
 * Application-layer entry point for experiment use cases.
 *
 * Responsibilities: coordinate experiment use cases on behalf of the
 * controller/API layer and delegate execution to the Experiment Engine. It
 * holds no review or persistence logic of its own.
 *
 * Dependencies: an {@link IExperimentEngine} and a {@link Logger}, both injected.
 */
export class ExperimentService {
  private readonly engine: IExperimentEngine;
  private readonly logger: Logger;

  public constructor(engine: IExperimentEngine, logger: Logger) {
    this.engine = engine;
    this.logger = logger;
  }

  /** Start (or reuse) an experiment. */
  public async runExperiment(
    input: RunExperimentInput,
  ): Promise<RunExperimentResult> {
    this.logger.info("Run experiment requested", {
      snapshotId: input.snapshotId,
      architecture: input.architecture,
    });
    return this.engine.run(input);
  }

  /** Retry a failed experiment. */
  public async retryExperiment(
    experimentId: string,
  ): Promise<RunExperimentResult> {
    this.logger.info("Retry experiment requested", { experimentId });
    return this.engine.retry(experimentId);
  }

  /** Fetch the current status of an experiment. */
  public async getExperimentStatus(
    experimentId: string,
  ): Promise<ExperimentStatus> {
    return this.engine.getStatus(experimentId);
  }
}
