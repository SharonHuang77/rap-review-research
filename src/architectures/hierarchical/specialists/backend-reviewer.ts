import {
  LlmReviewSpecialist,
  type ReviewSpecialistDependencies,
} from "./review-specialist.ts";

/** Reviews backend concerns (APIs, business logic, auth, validation, concurrency). */
export class BackendReviewer extends LlmReviewSpecialist {
  public constructor(deps: ReviewSpecialistDependencies) {
    super({ role: "backend", promptCategory: "hierarchical" }, deps);
  }
}
