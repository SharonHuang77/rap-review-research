import type { ReviewArchitecture } from "../../models/experiment.ts";
import type {
  ReviewExecutionInput,
  RawReviewResult,
} from "../../models/review-result.ts";
import type { ReviewFinding, RiskLevel } from "../../models/finding.ts";
import type { IReviewArchitecture } from "../review-architecture.ts";

/**
 * A model-output-shaped object the mock places into `rawOutput` (what a real
 * LLM would emit before validation). Deliberately independent of
 * `ValidatedReviewResult`, which is the *post-validation* type (RFC-05).
 */
export interface MockReviewOutput {
  readonly architecture?: ReviewArchitecture;
  readonly summary: string;
  readonly riskLevel?: RiskLevel;
  readonly findings: ReviewFinding[];
}

/**
 * Configuration for {@link MockReviewArchitecture}.
 *
 * Every field is optional so the mock can stand in for any topology and be
 * tuned for both happy-path and failure-path tests.
 */
export interface MockReviewArchitectureOptions {
  /** Topology name to report. Defaults to "agentless". */
  readonly name?: ReviewArchitecture;
  /** When set, `execute` rejects with this error (failure-path testing). */
  readonly failWith?: Error;
  /** The model-output-shaped object to place into `rawOutput`. */
  readonly output?: MockReviewOutput;
  /** Execution metrics to report. Sensible defaults are supplied. */
  readonly metrics?: Partial<
    Pick<
      RawReviewResult,
      | "inputTokens"
      | "outputTokens"
      | "estimatedCostUsd"
      | "latencyMs"
      | "messageCount"
      | "llmCalls"
    >
  >;
  /** Optional hook invoked with the execution input, for assertions. */
  readonly onExecute?: (input: ReviewExecutionInput) => void;
}

/**
 * Deterministic, dependency-free {@link IReviewArchitecture} used to exercise
 * the Experiment Engine without any LLM provider.
 *
 * It never calls a model; it simply returns a pre-configured raw result (or
 * throws a pre-configured error). This is the "mock architecture" the RFC-01
 * Definition of Done refers to.
 */
export class MockReviewArchitecture implements IReviewArchitecture {
  public readonly name: ReviewArchitecture;
  private readonly options: MockReviewArchitectureOptions;

  public constructor(options: MockReviewArchitectureOptions = {}) {
    this.name = options.name ?? "agentless";
    this.options = options;
  }

  public async execute(
    input: ReviewExecutionInput,
  ): Promise<RawReviewResult> {
    this.options.onExecute?.(input);

    if (this.options.failWith) {
      throw this.options.failWith;
    }

    const output: MockReviewOutput =
      this.options.output ?? this.defaultOutput();
    const metrics = this.options.metrics ?? {};

    return {
      architecture: this.name,
      summary: output.summary,
      rawOutput: output,
      findings: output.findings,
      inputTokens: metrics.inputTokens ?? 1000,
      outputTokens: metrics.outputTokens ?? 250,
      estimatedCostUsd: metrics.estimatedCostUsd ?? 0.01,
      latencyMs: metrics.latencyMs ?? 1200,
      messageCount: metrics.messageCount ?? 1,
      llmCalls: metrics.llmCalls ?? 1,
    };
  }

  private defaultOutput(): MockReviewOutput {
    return {
      architecture: this.name,
      summary: "Mock review summary.",
      riskLevel: "low",
      findings: [
        {
          id: "finding-mock-1",
          title: "Mock finding",
          category: "correctness",
          severity: "low",
          file: "src/example.ts",
          line: 1,
          description: "A mock finding produced by the test architecture.",
          recommendation: "No action required; this is a fixture.",
          confidence: 0.5,
        },
      ],
    };
  }
}
