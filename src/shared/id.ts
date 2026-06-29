import type { ReviewArchitecture } from "../models/experiment.ts";

/**
 * The fields that deterministically identify an experiment.
 *
 * Per Principle 8 (Idempotent Experiments) the identity of an experiment is a
 * function of its snapshot, architecture, and the four version fields.
 */
export interface IdempotencyFields {
  readonly snapshotId: string;
  readonly architecture: ReviewArchitecture;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly workflowVersion: string;
  readonly evaluationVersion: string;
}

/**
 * Build the deterministic idempotency key for an experiment request.
 *
 * Example: `snap_042#agentless#gpt-4.1#prompt-v1#workflow-v1#eval-v1`
 */
export function buildIdempotencyKey(fields: IdempotencyFields): string {
  return [
    fields.snapshotId,
    fields.architecture,
    fields.modelVersion,
    fields.promptVersion,
    fields.workflowVersion,
    fields.evaluationVersion,
  ].join("#");
}

/**
 * Allocates experiment identifiers.
 *
 * For a first run the identifier is the idempotency key itself (keeping the
 * identity deterministic and reproducible). A forced rerun produces a new,
 * distinct *versioned* identifier so historical experiments are never
 * overwritten.
 */
export interface IdGenerator {
  nextExperimentId(idempotencyKey: string, isRerun: boolean): string;
}

/**
 * Default identifier allocator.
 *
 * Deterministic given call order: reruns receive a monotonically increasing
 * `#rerun-N` suffix. This avoids any reliance on randomness or wall-clock time.
 */
export class DefaultIdGenerator implements IdGenerator {
  private rerunCounter = 0;

  public nextExperimentId(idempotencyKey: string, isRerun: boolean): string {
    if (!isRerun) {
      return idempotencyKey;
    }
    this.rerunCounter += 1;
    return `${idempotencyKey}#rerun-${this.rerunCounter}`;
  }
}
