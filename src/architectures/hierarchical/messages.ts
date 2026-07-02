/**
 * Hierarchical re-exports the shared agent primitives (extracted in RFC-09 so
 * Hierarchical and Consensus share them without depending on each other).
 */
export type { AgentRole, AgentMessageType, AgentMessage } from "../shared/agent.ts";
