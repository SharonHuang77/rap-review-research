import type { ReviewArchitecture } from "../../../src/models/experiment.ts";
import type { ReviewFinding } from "../../../src/models/finding.ts";
import type {
  StoredExperimentResult,
  StoredValidatedReviewResult,
  StoredReviewFinding,
} from "../../../src/storage/stored-models.ts";

const STORED_AT = "2026-07-02T00:00:00.000Z";

/** Build a canonical ReviewFinding for tests. */
export function buildFinding(
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding {
  return {
    id: "f1",
    title: "Issue",
    severity: "high",
    category: "security",
    file: "src/a.ts",
    line: 1,
    description: "desc",
    recommendation: "fix it",
    confidence: 0.8,
    ...overrides,
  };
}

export interface BuildStoredResultOptions {
  readonly experimentId?: string;
  readonly architecture?: ReviewArchitecture;
  readonly findings?: ReviewFinding[];
  readonly latencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly llmCalls?: number;
  readonly messageCount?: number;
  /** When false, no validated result is stored (a failed experiment). */
  readonly validated?: boolean;
}

/** Build a StoredExperimentResult (validated by default). */
export function buildStoredResult(
  opts: BuildStoredResultOptions = {},
): StoredExperimentResult {
  const experimentId = opts.experimentId ?? "snap_001#agentless#m#v1#w1#e1";
  const architecture = opts.architecture ?? "agentless";
  const findings = opts.findings ?? [buildFinding()];

  if (opts.validated === false) {
    return { experimentId, rawResult: null, validatedResult: null, findings: [] };
  }

  const validatedResult: StoredValidatedReviewResult = {
    experimentId,
    architecture,
    summary: "summary",
    findings,
    validation: {
      schemaVersion: "review-result-v1",
      promptVersion: "v1",
      validationPassed: true,
      repaired: false,
      repairActions: [],
    },
    latencyMs: opts.latencyMs ?? 1000,
    inputTokens: opts.inputTokens ?? 500,
    outputTokens: opts.outputTokens ?? 100,
    estimatedCostUsd: opts.estimatedCostUsd ?? 0.01,
    llmCalls: opts.llmCalls ?? 1,
    messageCount: opts.messageCount ?? 1,
    storedAt: STORED_AT,
  };

  const storedFindings: StoredReviewFinding[] = findings.map((f) => ({
    ...f,
    experimentId,
    architecture,
    storedAt: STORED_AT,
  }));

  return { experimentId, rawResult: null, validatedResult, findings: storedFindings };
}
