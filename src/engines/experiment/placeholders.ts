import type {
  RawReviewResult,
  ValidatedReviewResult,
} from "../../models/review-result.ts";
import type { ReviewFinding, RiskLevel } from "../../models/finding.ts";
import type { IOutputValidator, IEvaluationTrigger } from "./ports.ts";

/**
 * Placeholder validator used by RFC-01.
 *
 * IMPORTANT: this performs **no schema validation**. It exists only so the
 * Experiment Engine can drive the full lifecycle end-to-end before the
 * Validation Engine RFC is implemented. It trusts `rawOutput` to already be a
 * validated-shaped object and normalises it into a {@link ValidatedReviewResult}.
 * It will be replaced wholesale by the real Validation Engine.
 */
export class PassthroughOutputValidator implements IOutputValidator {
  public async validate(
    raw: RawReviewResult,
  ): Promise<ValidatedReviewResult> {
    const output = (raw.rawOutput ?? {}) as Partial<ValidatedReviewResult>;
    return {
      architecture: raw.architecture,
      summary: output.summary ?? "",
      riskLevel: (output.riskLevel ?? "low") as RiskLevel,
      findings: (output.findings ?? []) as ReviewFinding[],
      messageCount: raw.messageCount,
    };
  }
}

/**
 * Placeholder evaluation trigger used by RFC-01.
 *
 * IMPORTANT: this computes **no metrics**. It is a no-op standing in for the
 * Evaluation Engine RFC so the lifecycle can reach the `evaluating` state.
 */
export class NoopEvaluationTrigger implements IEvaluationTrigger {
  public async evaluate(): Promise<void> {
    /* intentionally empty — replaced by the Evaluation Engine RFC */
  }
}
