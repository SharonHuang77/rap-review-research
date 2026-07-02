import {
  LlmReviewSpecialist,
  type ReviewSpecialistDependencies,
} from "./review-specialist.ts";

/** Reviews frontend concerns (components, UX, accessibility, state, rendering). */
export class FrontendReviewer extends LlmReviewSpecialist {
  public constructor(deps: ReviewSpecialistDependencies) {
    super({ role: "frontend", promptCategory: "hierarchical" }, deps);
  }
}
