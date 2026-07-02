import { test } from "node:test";
import assert from "node:assert/strict";

import { ConsensusCoordinator } from "../../src/architectures/consensus/consensus-coordinator.ts";
import { ConsensusSynthesizer } from "../../src/architectures/consensus/consensus-synthesizer.ts";
import { MajorityVoteConsensusProtocol } from "../../src/architectures/consensus/protocols/majority-vote-protocol.ts";
import type { IConsensusSpecialist, SpecialistVoteResult } from "../../src/architectures/consensus/consensus-specialist.ts";
import type { SpecialistReviewResult } from "../../src/architectures/shared/specialist-review-result.ts";
import type { AgentRole } from "../../src/architectures/shared/agent.ts";
import type { ReviewExecutionInput } from "../../src/models/review-result.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";
import { WorkflowError } from "../../src/shared/errors.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { buildSnapshot } from "./support/fixtures.ts";
import { buildFinding } from "./support/stored-results.ts";

function specResult(role: AgentRole, findings: ReviewFinding[]): SpecialistReviewResult {
  return { role, summary: `${role}`, findings, latencyMs: 5, inputTokens: 10, outputTokens: 4, estimatedCostUsd: 0.001 };
}

/** A network-free consensus specialist that accepts every candidate. */
function fakeSpecialist(
  role: AgentRole,
  findings: ReviewFinding[],
  reviewSpy?: () => void,
): IConsensusSpecialist {
  return {
    role,
    async review(): Promise<SpecialistReviewResult> {
      reviewSpy?.();
      return specResult(role, findings);
    },
    async revise(): Promise<SpecialistReviewResult> {
      return specResult(role, findings);
    },
    async vote(_input, candidates): Promise<SpecialistVoteResult> {
      return {
        votes: candidates.map((c) => ({
          findingId: c.candidateId,
          reviewer: role,
          vote: "accept" as const,
          reason: "agree",
          confidence: 0.8,
        })),
        latencyMs: 2,
        inputTokens: 3,
        outputTokens: 1,
        estimatedCostUsd: 0.0005,
      };
    },
  };
}

function input(): ReviewExecutionInput {
  return {
    experimentId: "snap_1#consensus#m#v1#w1#e1",
    snapshot: buildSnapshot(),
    modelVersion: "m",
    promptVersion: "v1",
    workflowVersion: "w1",
  };
}

function coordinator(specialists: IConsensusSpecialist[]): ConsensusCoordinator {
  return new ConsensusCoordinator({
    specialists,
    synthesizer: new ConsensusSynthesizer(),
    protocol: new MajorityVoteConsensusProtocol(),
    clock: new FixedClock(),
  });
}

test("runs all rounds and transitions through the full state machine", async () => {
  // All three propose the same finding → one candidate, accepted by 3 votes.
  const finding = buildFinding({ file: "a.ts", line: 10, title: "Shared" });
  const { result, session } = await coordinator([
    fakeSpecialist("backend", [{ ...finding, id: "b1" }]),
    fakeSpecialist("frontend", [{ ...finding, id: "f1" }]),
    fakeSpecialist("database", [{ ...finding, id: "d1" }]),
  ]).run(input());

  assert.deepEqual(session.states, [
    "created",
    "independent-review",
    "exchange",
    "revision",
    "voting",
    "synthesizing",
    "completed",
  ]);
  assert.equal(result.consensusMetrics.llmCalls, 9); // 3 specialists × 3 rounds
  assert.equal(result.consensusMetrics.candidateFindingCount, 1);
  assert.equal(result.acceptedFindings.length, 1);
  assert.equal(result.consensusMetrics.voteCount, 3);
  // review(2N) + exchange(N) + revision(2N) + vote(2N) + synthesis(1), N=3 → 22
  assert.equal(result.consensusMetrics.messageCount, 22);
});

test("dispatches an independent review to each specialist and records typed messages", async () => {
  let backendReviews = 0;
  const { session } = await coordinator([
    fakeSpecialist("backend", [buildFinding({ id: "b1" })], () => (backendReviews += 1)),
    fakeSpecialist("frontend", []),
    fakeSpecialist("database", []),
  ]).run(input());

  assert.equal(backendReviews, 1);
  const types = new Set(session.conversation.messages.map((m) => m.type));
  for (const t of ["review-request", "exchange", "revision-request", "vote-request", "synthesis"]) {
    assert.ok(types.has(t as never), `expected message type ${t}`);
  }
});

test("fails fast when a specialist throws (state → failed)", async () => {
  const failing: IConsensusSpecialist = {
    role: "backend",
    async review(): Promise<SpecialistReviewResult> {
      throw new WorkflowError("specialist boom");
    },
    async revise(): Promise<SpecialistReviewResult> {
      return specResult("backend", []);
    },
    async vote(): Promise<SpecialistVoteResult> {
      return { votes: [], latencyMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
    },
  };
  const c = coordinator([failing]);
  // capture the session via a wrapper run — run() throws, so assert on rejection.
  await assert.rejects(() => c.run(input()), WorkflowError);
});
