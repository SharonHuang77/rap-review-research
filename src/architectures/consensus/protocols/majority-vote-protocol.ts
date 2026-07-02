import type { ConsensusSession } from "../consensus-session.ts";
import type { ConsensusReviewResult } from "../models/consensus-review-result.ts";
import type { SpecialistReviewResult } from "../../shared/specialist-review-result.ts";
import type { ReviewVote } from "../models/review-vote.ts";
import type { IConsensusProtocol } from "./consensus-protocol.ts";

/**
 * The initial consensus algorithm: independent review → finding exchange →
 * revision → voting → majority-rule synthesis. Deterministic given the same
 * specialist responses. Each specialist makes 3 LLM calls (review, revise, vote)
 * → llmCalls = 3 × specialistCount.
 */
export class MajorityVoteConsensusProtocol implements IConsensusProtocol {
  public async execute(
    session: ConsensusSession,
  ): Promise<ConsensusReviewResult> {
    const { input, specialists, synthesizer } = session;
    const snapshotId = input.snapshot.snapshotId;

    // Round 1 — Independent review.
    session.transition("independent-review");
    const independentResults: SpecialistReviewResult[] = [];
    for (const specialist of specialists) {
      session.send("coordinator", specialist.role, "review-request", { snapshotId });
      const result = await specialist.review(input);
      session.send(specialist.role, "coordinator", "review-response", {
        findingCount: result.findings.length,
      });
      independentResults.push(result);
    }

    // Round 2 — Finding exchange (peer findings shared with every specialist).
    session.transition("exchange");
    const peerFindings = independentResults.flatMap((r) => r.findings);
    for (const specialist of specialists) {
      session.send("coordinator", specialist.role, "exchange", {
        sharedFindingCount: peerFindings.length,
      });
    }

    // Round 3 — Revision.
    session.transition("revision");
    const revisedResults: SpecialistReviewResult[] = [];
    for (const specialist of specialists) {
      session.send("coordinator", specialist.role, "revision-request", {
        peerFindingCount: peerFindings.length,
      });
      const result = await specialist.revise(input, peerFindings);
      session.send(specialist.role, "coordinator", "revision-response", {
        findingCount: result.findings.length,
      });
      revisedResults.push(result);
    }

    // Candidate generation (deduplicated, before voting).
    const { candidates, duplicateCount } = synthesizer.generateCandidates(
      independentResults,
      revisedResults,
    );

    // Round 4 — Voting.
    session.transition("voting");
    const votes: ReviewVote[] = [];
    let voteInputTokens = 0;
    let voteOutputTokens = 0;
    let voteLatencyMs = 0;
    let voteCostUsd = 0;
    for (const specialist of specialists) {
      session.send("coordinator", specialist.role, "vote-request", {
        candidateCount: candidates.length,
      });
      const voteResult = await specialist.vote(input, candidates);
      session.send(specialist.role, "coordinator", "vote-response", {
        voteCount: voteResult.votes.length,
      });
      votes.push(...voteResult.votes);
      voteInputTokens += voteResult.inputTokens;
      voteOutputTokens += voteResult.outputTokens;
      voteLatencyMs += voteResult.latencyMs;
      voteCostUsd += voteResult.estimatedCostUsd;
    }

    // Aggregate LLM usage across every round (review + revision + voting).
    const rounds = [...independentResults, ...revisedResults];
    const inputTokens = rounds.reduce((s, r) => s + r.inputTokens, voteInputTokens);
    const outputTokens = rounds.reduce((s, r) => s + r.outputTokens, voteOutputTokens);
    const latencyMs = rounds.reduce((s, r) => s + r.latencyMs, voteLatencyMs);
    const estimatedCostUsd = rounds.reduce((s, r) => s + r.estimatedCostUsd, voteCostUsd);

    // Synthesis (deterministic majority rule; no LLM).
    session.transition("synthesizing");
    session.send("coordinator", "coordinator", "synthesis", {
      candidateCount: candidates.length,
    });
    return synthesizer.synthesize({
      independentResults,
      revisedResults,
      candidates,
      votes,
      duplicateCount,
      specialistCount: specialists.length,
      llmCalls: specialists.length * 3,
      messageCount: session.conversation.messages.length,
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd,
    });
  }
}
