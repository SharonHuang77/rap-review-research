import type {
  Experiment,
  ExperimentStatus,
  ExperimentCompletionSummary,
} from "../../models/experiment.ts";
import type { ExperimentRepository } from "../experiment-repository.ts";
import { StorageError } from "../../shared/errors.ts";
import { buildIdempotencyKey } from "../../shared/id.ts";

/**
 * In-memory {@link ExperimentRepository} for development and unit tests.
 *
 * Responsibilities: store experiment aggregates and resolve them by id or by
 * idempotency key. It additionally records a per-experiment `statusHistory`
 * (a testing affordance) so lifecycle transitions can be asserted.
 *
 * Dependencies: none. No database, no AWS — exactly as required by RFC-01.
 */
export class InMemoryExperimentRepository implements ExperimentRepository {
  private readonly byId = new Map<string, Experiment>();
  /** Insertion order of experiment ids, used to find the most recent match. */
  private readonly order: string[] = [];
  /** Observed status transitions per experiment (test inspection only). */
  private readonly history = new Map<string, ExperimentStatus[]>();

  public async findById(experimentId: string): Promise<Experiment | null> {
    const found = this.byId.get(experimentId);
    return found ? { ...found } : null;
  }

  public async findByIdempotencyKey(key: string): Promise<Experiment | null> {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const id = this.order[i] as string;
      const experiment = this.byId.get(id);
      if (experiment && buildIdempotencyKey(experiment) === key) {
        return { ...experiment };
      }
    }
    return null;
  }

  public async create(experiment: Experiment): Promise<void> {
    if (this.byId.has(experiment.experimentId)) {
      throw new StorageError(
        `Experiment "${experiment.experimentId}" already exists.`,
      );
    }
    this.byId.set(experiment.experimentId, { ...experiment });
    this.order.push(experiment.experimentId);
    this.history.set(experiment.experimentId, [experiment.status]);
  }

  public async updateStatus(
    experimentId: string,
    status: ExperimentStatus,
  ): Promise<void> {
    const experiment = this.require(experimentId);
    experiment.status = status;
    this.recordTransition(experimentId, status);
  }

  public async markFailed(
    experimentId: string,
    errorMessage: string,
  ): Promise<void> {
    const experiment = this.require(experimentId);
    experiment.status = "failed";
    experiment.errorMessage = errorMessage;
    this.recordTransition(experimentId, "failed");
  }

  public async markCompleted(
    experimentId: string,
    summary: ExperimentCompletionSummary,
  ): Promise<void> {
    const experiment = this.require(experimentId);
    experiment.status = "completed";
    experiment.startedAt = summary.startedAt;
    experiment.completedAt = summary.completedAt;
    experiment.totalLatencyMs = summary.totalLatencyMs;
    experiment.totalInputTokens = summary.totalInputTokens;
    experiment.totalOutputTokens = summary.totalOutputTokens;
    experiment.estimatedCostUsd = summary.estimatedCostUsd;
    this.recordTransition(experimentId, "completed");
  }

  /** Observed lifecycle transitions for an experiment (testing helper). */
  public statusHistory(experimentId: string): ExperimentStatus[] {
    return [...(this.history.get(experimentId) ?? [])];
  }

  private require(experimentId: string): Experiment {
    const experiment = this.byId.get(experimentId);
    if (!experiment) {
      throw new StorageError(`Experiment "${experimentId}" does not exist.`);
    }
    return experiment;
  }

  private recordTransition(
    experimentId: string,
    status: ExperimentStatus,
  ): void {
    const log = this.history.get(experimentId) ?? [];
    log.push(status);
    this.history.set(experimentId, log);
  }
}
