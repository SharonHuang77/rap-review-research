import {
  LlmReviewSpecialist,
  type ReviewSpecialistDependencies,
} from "./review-specialist.ts";

/** Reviews database concerns (SQL, schema, indexes, migrations, transactions). */
export class DatabaseReviewer extends LlmReviewSpecialist {
  public constructor(deps: ReviewSpecialistDependencies) {
    super("database", deps);
  }
}
