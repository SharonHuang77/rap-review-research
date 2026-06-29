import type {
  RawReviewResult,
  ValidatedReviewResult,
} from "../../models/review-result.ts";

/**
 * Validation collaborator port.
 *
 * The Experiment Engine never validates model output itself — it hands the raw
 * architecture result to this port and receives a structured, schema-safe
 * result. The concrete implementation is owned by the **Validation Engine**
 * (a future RFC); RFC-01 only depends on the interface and wires a placeholder.
 */
export interface IOutputValidator {
  /**
   * Validate (and repair, if necessary) a raw review result.
   * @throws ValidationError when the output cannot be made schema-valid.
   */
  validate(raw: RawReviewResult): Promise<ValidatedReviewResult>;
}

/**
 * Evaluation collaborator port.
 *
 * After validation the engine triggers evaluation through this port. Computing
 * research metrics (precision, recall, evidence score, …) is owned by the
 * **Evaluation Engine** (a future RFC); RFC-01 only depends on the interface
 * and wires a placeholder.
 */
export interface IEvaluationTrigger {
  /** Trigger evaluation for an experiment's validated result. */
  evaluate(
    experimentId: string,
    result: ValidatedReviewResult,
  ): Promise<void>;
}
