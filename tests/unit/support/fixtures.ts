import type { PRSnapshot } from "../../../src/models/snapshot.ts";
import type { RunExperimentInput } from "../../../src/models/experiment.ts";

/** Build a deterministic PR Snapshot for tests. */
export function buildSnapshot(
  overrides: Partial<PRSnapshot> = {},
): PRSnapshot {
  return {
    snapshotId: "snap_001",
    repository: "org/repo",
    prNumber: 1,
    commitHash: "abc123",
    title: "Add feature",
    description: "A test pull request.",
    rawDiff: "diff --git a/x b/x",
    changedFiles: [
      { path: "src/x.ts", changedLines: [{ start: 1, end: 10 }] },
    ],
    importedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Build a deterministic run-experiment request for tests. */
export function buildRunInput(
  overrides: Partial<RunExperimentInput> = {},
): RunExperimentInput {
  return {
    snapshotId: "snap_001",
    architecture: "agentless",
    modelVersion: "gpt-4.1",
    promptVersion: "prompt-v1",
    workflowVersion: "workflow-v1",
    evaluationVersion: "eval-v1",
    ...overrides,
  };
}
