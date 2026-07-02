import type {
  RawReviewResult,
  ValidatedReviewResult,
} from "../../models/review-result.ts";

/**
 * Optional context the engine supplies to the validator (experiment identity,
 * prompt/schema versions) so it can be recorded in the validation metadata.
 */
export interface OutputValidationContext {
  readonly experimentId?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
}

/**
 * Validation collaborator port.
 *
 * The Experiment Engine never validates model output itself — it hands the raw
 * architecture result to this port and receives a structured, schema-valid
 * result. The concrete implementation is the **Validation Engine** (RFC-05).
 */
export interface IOutputValidator {
  /**
   * Validate (and repair, if necessary) a raw review result.
   * @throws ValidationError when the output cannot be made schema-valid.
   */
  validate(
    raw: RawReviewResult,
    context?: OutputValidationContext,
  ): Promise<ValidatedReviewResult>;
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
