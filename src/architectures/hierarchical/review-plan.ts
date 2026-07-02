import type { AgentRole } from "./messages.ts";
import type { ReviewExecutionInput } from "../../models/review-result.ts";

/**
 * The plan the Manager creates before dispatching specialists.
 */
export interface ReviewPlan {
  readonly experimentId: string;
  readonly specialists: AgentRole[];
}

/**
 * Planning strategy. The Manager delegates plan creation here rather than
 * building plans directly (RFC-08 §13.1), so future planners can skip
 * irrelevant specialists / add budgets without changing the Manager.
 *
 * NOTE: takes `ReviewExecutionInput` (not just `PRSnapshot` as §13.1 sketches)
 * because `ReviewPlan.experimentId` requires the experiment id, which lives on
 * the input, not the snapshot. See the compliance report.
 */
export interface IReviewPlanner {
  createPlan(input: ReviewExecutionInput): ReviewPlan;
}

/**
 * Default planner: always invokes every registered specialist (RFC-08 §10
 * Stage 2 — "the initial implementation may always invoke all three").
 */
export class DefaultReviewPlanner implements IReviewPlanner {
  private readonly roles: AgentRole[];

  public constructor(roles: AgentRole[]) {
    this.roles = roles;
  }

  public createPlan(input: ReviewExecutionInput): ReviewPlan {
    return { experimentId: input.experimentId, specialists: [...this.roles] };
  }
}
