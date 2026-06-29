import type { ReviewArchitecture } from "../models/experiment.ts";
import type {
  ReviewExecutionInput,
  RawReviewResult,
} from "../models/review-result.ts";

/**
 * The plugin contract every review architecture must implement.
 *
 * The Experiment Engine depends only on this interface — it contains no
 * architecture-specific logic, so adding a fourth topology requires no changes
 * to the engine (Principle 11, Extensible Architecture).
 */
export interface IReviewArchitecture {
  /** The topology this implementation provides. */
  readonly name: ReviewArchitecture;

  /**
   * Execute the review workflow for one experiment and return the raw,
   * unvalidated result plus execution metrics.
   */
  execute(input: ReviewExecutionInput): Promise<RawReviewResult>;
}

/**
 * Registers and resolves {@link IReviewArchitecture} implementations by name.
 *
 * This is the seam the Experiment Engine uses to select an architecture without
 * knowing any concrete implementation. The engine depends only on this
 * interface and only ever calls {@link get}; registration happens at composition
 * time.
 */
export interface ArchitectureRegistry {
  /** Register (or replace) an architecture under its declared name. */
  register(architecture: IReviewArchitecture): void;

  /**
   * Return the architecture registered under `name`.
   * @throws UnknownArchitectureError when no implementation is registered.
   */
  get(name: ReviewArchitecture): IReviewArchitecture;
}
