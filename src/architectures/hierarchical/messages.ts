/**
 * Roles in the hierarchical topology. The `manager` coordinates; the others are
 * specialist reviewers. Future RFCs may extend this union (security, etc.).
 */
export type AgentRole = "manager" | "backend" | "frontend" | "database";

/**
 * Types of messages exchanged in the hierarchy. `merge-*` are used by the
 * manager's synthesis step and prepare the platform for richer RFC-09 models.
 */
export type AgentMessageType =
  | "review-request"
  | "review-response"
  | "merge-request"
  | "merge-response";

/**
 * A strongly-typed message between agents. Raw strings are never passed between
 * agents — this improves replayability and future visualization.
 */
export interface AgentMessage {
  readonly from: AgentRole;
  readonly to: AgentRole;
  readonly type: AgentMessageType;
  readonly content: unknown;
  readonly timestamp: string;
}
