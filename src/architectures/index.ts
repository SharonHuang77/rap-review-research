/**
 * Public barrel for the review-architecture layer.
 */
export type {
  IReviewArchitecture,
  ArchitectureRegistry,
} from "./review-architecture.ts";

export { InMemoryArchitectureRegistry } from "./in-memory-architecture-registry.ts";
export { MockReviewArchitecture } from "./mock/mock-review-architecture.ts";
export type { MockReviewArchitectureOptions } from "./mock/mock-review-architecture.ts";
