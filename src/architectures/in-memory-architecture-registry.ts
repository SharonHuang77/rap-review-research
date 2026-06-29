import type { ReviewArchitecture } from "../models/experiment.ts";
import type {
  IReviewArchitecture,
  ArchitectureRegistry,
} from "./review-architecture.ts";
import { UnknownArchitectureError } from "../shared/errors.ts";

/**
 * In-memory {@link ArchitectureRegistry}.
 *
 * Responsibilities:
 *  - hold registered review-architecture plugins keyed by name;
 *  - resolve them on demand for the Experiment Engine.
 *
 * Dependencies: none (pure in-memory map). Architectures are registered at
 * composition time, keeping the engine free of architecture-specific imports.
 */
export class InMemoryArchitectureRegistry implements ArchitectureRegistry {
  private readonly architectures = new Map<
    ReviewArchitecture,
    IReviewArchitecture
  >();

  /** Register (or replace) an architecture under its declared name. */
  public register(architecture: IReviewArchitecture): void {
    this.architectures.set(architecture.name, architecture);
  }

  /** Whether an architecture is registered under `name`. */
  public has(name: ReviewArchitecture): boolean {
    return this.architectures.has(name);
  }

  public getArchitecture(name: ReviewArchitecture): IReviewArchitecture {
    const architecture = this.architectures.get(name);
    if (!architecture) {
      throw new UnknownArchitectureError(
        `No review architecture is registered for "${name}".`,
      );
    }
    return architecture;
  }
}
