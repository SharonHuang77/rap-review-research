import type { IEvaluationTrigger } from "./ports.ts";

/**
 * Placeholder evaluation trigger.
 *
 * IMPORTANT: this computes **no metrics**. It is a no-op standing in for the
 * Evaluation Engine RFC so the lifecycle can reach the `evaluating` state.
 *
 * (The validation placeholder was removed in RFC-05 — the Experiment Engine now
 * uses the real `ValidationEngine` from `src/validation`.)
 */
export class NoopEvaluationTrigger implements IEvaluationTrigger {
  public async evaluate(): Promise<void> {
    /* intentionally empty — replaced by the Evaluation Engine RFC */
  }
}
