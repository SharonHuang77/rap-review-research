import type { AgentRole } from "../../shared/agent.ts";
import type { ReviewFinding } from "../../../models/finding.ts";

/**
 * A deduplicated finding proposed for voting. Merges duplicate findings from
 * multiple specialists (same file+line+title), accumulating the source finding
 * ids and the roles that proposed it.
 */
export interface CandidateFinding {
  readonly candidateId: string;
  readonly sourceFindingIds: string[];
  readonly title: string;
  readonly severity: ReviewFinding["severity"];
  readonly category: ReviewFinding["category"];
  readonly file: string;
  readonly line: number;
  readonly description: string;
  readonly recommendation: string;
  readonly proposedBy: AgentRole[];
}
