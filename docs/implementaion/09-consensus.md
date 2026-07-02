# 09 — Decentralized Consensus Review Architecture

**Module:** Decentralized Consensus Review Architecture
**Status:** Ready for Implementation
**Dependencies:** RFC-03 Review Architecture Framework, RFC-03.5 LLM Architecture, RFC-05 Validation Engine, RFC-06 Storage Engine, RFC-07 Evaluation Engine, RFC-08 Hierarchical Architecture

---

## 1. Purpose

The Decentralized Consensus Review Architecture is the third review topology evaluated by the platform.

Unlike Agentless, which uses one reviewer, and Hierarchical, which uses centralized manager coordination, Consensus uses multiple specialist reviewers who independently review the same PR Snapshot, exchange findings, revise their positions, and vote on final findings.

The purpose is to evaluate whether peer-style communication improves automated code review quality compared with both a single reviewer and centralized coordination.

---

## 2. Research Role

Consensus is the decentralized experimental treatment.

It answers:

> Does peer discussion and consensus formation improve code review quality compared with Agentless and Hierarchical review?

This architecture intentionally removes manager authority. A coordinator may schedule rounds, but it must not decide the correctness of findings.

---

## 3. Responsibilities

Consensus is responsible for:

* running independent specialist reviews
* sharing findings between specialists
* collecting revision responses
* collecting votes
* synthesizing accepted findings
* returning `RawReviewResult`
* recording consensus-specific metrics

Consensus is not responsible for:

* validating JSON
* storing results
* computing evaluation metrics
* calling Bedrock directly
* accessing repositories directly
* rendering dashboard views

---

## 4. Architecture

```text
Experiment Engine
        ↓
ConsensusArchitecture
        ↓
ConsensusCoordinator
        ↓
Independent Specialist Reviews
        ↓
Peer Discussion Round
        ↓
Revision Round
        ↓
Voting Round
        ↓
ConsensusSynthesizer
        ↓
RawReviewResult
```

The coordinator controls sequencing only. It does not act as a manager reviewer.

---

## 5. Key Difference from Hierarchical

| Feature                  | Hierarchical                | Consensus                      |
| ------------------------ | --------------------------- | ------------------------------ |
| Coordinator role         | Manager decides final merge | Coordinator schedules protocol |
| Specialist communication | Through manager only        | Peer-style shared findings     |
| Final decision           | Manager synthesis           | Vote-based consensus           |
| Authority model          | Centralized                 | Decentralized                  |
| Main research signal     | specialization + authority  | peer agreement + revision      |

---

## 6. Agents

Reuse the specialist model from RFC-08.

Initial specialists:

* Backend Reviewer
* Frontend Reviewer
* Database Reviewer

Each specialist must implement the shared `IReviewSpecialist` interface.

Consensus may reuse RFC-08 specialists if they are sufficiently generic. If reuse creates coupling to Hierarchical, extract shared specialists into a common location.

---

## 7. Consensus Coordinator

The ConsensusCoordinator is responsible only for orchestrating a consensus session.

Responsibilities:

- create consensus session
- initialize conversation history
- invoke the configured consensus protocol
- record lifecycle state
- return the final ConsensusReviewResult

The coordinator must not:

- perform code review
- implement voting logic
- implement discussion rounds
- decide consensus
- rewrite findings

Consensus behavior belongs to a pluggable protocol implementation.

## 8. Consensus Workflow

```text
1. Independent Review Round
2. Finding Exchange Round
3. Revision Round
4. Voting Round
5. Consensus Synthesis
```

# 8.1 Consensus Protocol

Consensus should be implemented using a pluggable protocol.

```ts
export interface IConsensusProtocol {

    execute(
        session: ConsensusSession
    ): Promise<ConsensusReviewResult>;

}
```

The protocol owns the complete consensus algorithm.

The initial implementation should provide:

```ts
export class MajorityVoteConsensusProtocol
    implements IConsensusProtocol {

}
```

The protocol is responsible for:

- independent review round
- finding exchange
- revision round
- voting round
- consensus synthesis

Future implementations may include:

- DebateProtocol
- DelphiProtocol
- MultiRoundConsensusProtocol

without modifying the ConsensusCoordinator.

### Design Decision

Consensus algorithms should be interchangeable.

### Rationale

The research compares communication topologies.

Different consensus protocols represent different experimental treatments.

Separating protocol execution from orchestration enables future experiments without modifying the coordinator.

---

## 9. Round 1 — Independent Review

Each specialist reviews the PR Snapshot independently.

No specialist sees another specialist's findings during Round 1.

Output:

```ts
SpecialistReviewResult[]
```

---

## 10. Round 2 — Finding Exchange

All Round 1 findings are shared with all specialists.

Each specialist receives:

* its own findings
* other specialists' findings
* PR Snapshot context
* instruction to assess agreement/disagreement

This round records peer feedback.

---

## 11. Round 3 — Revision

Each specialist may:

* keep original findings
* revise severity
* add supporting reasoning
* withdraw weak findings
* endorse another specialist's finding

Specialists should not invent new unrelated findings in this round unless they directly arise from peer evidence.

---

## 12. Round 4 — Voting

Each specialist votes on each candidate finding.

```ts
export type ConsensusVoteValue =
  | "accept"
  | "reject"
  | "revise";
```

```ts
export interface ReviewVote {
  findingId: string;
  reviewer: AgentRole;
  vote: ConsensusVoteValue;
  reason: string;
  confidence: number;
}
```

---

## 13. Consensus Rule

Initial rule:

```text
accepted if at least 2 of 3 specialists vote "accept"
rejected if at least 2 of 3 specialists vote "reject"
otherwise mark as "needs-review"
```

For the final `RawReviewResult`, include only accepted findings.

Rejected and needs-review findings may be preserved in consensus artifacts but should not be emitted as final findings unless future RFCs extend the output schema.

---

## 14. Candidate Finding

```ts
export interface CandidateFinding {
  candidateId: string;
  sourceFindingIds: string[];
  title: string;
  severity: ReviewFinding["severity"];
  category: ReviewFinding["category"];
  file: string;
  line: number;
  description: string;
  recommendation: string;
  proposedBy: AgentRole[];
}
```

Candidate findings should be deduplicated before voting.

---

## 15. Consensus Decision

```ts
export type ConsensusDecisionValue =
  | "accepted"
  | "rejected"
  | "needs-review";
```

```ts
export interface ConsensusDecision {
  candidateId: string;
  decision: ConsensusDecisionValue;
  votes: ReviewVote[];
  acceptedVoteCount: number;
  rejectedVoteCount: number;
}
```

---

## 16. Conversation History

Reuse the typed `AgentMessage` and `ConversationHistory` concepts from RFC-08.

Consensus should record:

* review request messages
* independent review responses
* exchange messages
* revision responses
* vote requests
* vote responses
* synthesis result

This prepares the architecture for future replay and dashboard visualization.

---

## 17. State Machine

```text
Created
  ↓
IndependentReview
  ↓
ExchangeFindings
  ↓
Revision
  ↓
Voting
  ↓
Synthesizing
  ↓
Completed
```

Failure:

```text
Any State
  ↓
Failed
```

Initial implementation should fail fast if any specialist fails.

No partial consensus mode is required yet.

---

## 18. Consensus Result

```ts
export interface ConsensusReviewResult {
  summary: string;
  independentResults: SpecialistReviewResult[];
  revisedResults: SpecialistReviewResult[];
  candidateFindings: CandidateFinding[];
  votes: ReviewVote[];
  decisions: ConsensusDecision[];
  acceptedFindings: ReviewFinding[];
  consensusMetrics: ConsensusMetrics;
}
```

---

## 19. Consensus Metrics

```ts
export interface ConsensusMetrics {
  specialistCount: number;
  candidateFindingCount: number;
  acceptedFindingCount: number;
  rejectedFindingCount: number;
  needsReviewFindingCount: number;
  voteCount: number;
  agreementRate: number;
  revisionCount: number;
  duplicateCount: number;
  llmCalls: number;
  messageCount: number;
}
```

These metrics should flow into `RawReviewResult` where applicable:

* `llmCalls`
* `messageCount`
* tokens
* latency
* cost

Consensus-specific metrics may be preserved as architecture artifacts for future dashboard/replay work.

---

## 20. LLM Calls

Initial implementation may use:

```text
Round 1:
  backend review
  frontend review
  database review

Round 3:
  backend revision
  frontend revision
  database revision

Round 4:
  backend vote
  frontend vote
  database vote
```

Expected minimum:

```text
llmCalls = 9
```

If the implementation combines revision and voting into one LLM call per specialist, document the deviation.

The key requirement is that Consensus must have more communication than Hierarchical and must preserve peer feedback/voting semantics.

---

## 21. Prompt Requirements

Use shared prompt infrastructure from RFC-03.5.

Templates:

```text
src/llm/prompts/templates/v1/consensus/
  backend-review.md
  frontend-review.md
  database-review.md
  revision.md
  voting.md
```

Prompts should share common review instructions and output schema.

Only role and round instructions should differ.

---

## 22. Synthesis

Implement `ConsensusSynthesizer`.

Responsibilities:

* deduplicate Round 1 and revised findings
* generate candidate findings
* apply voting rule
* produce accepted findings
* generate final summary
* calculate consensus metrics

The synthesizer should be deterministic.

It should not call an LLM in the initial implementation.

---

## 23. Duplicate Resolution

Use the same baseline heuristic as RFC-08:

```text
duplicate if file + line + normalized title match
```

When duplicates merge:

* highest severity wins
* highest confidence wins
* source finding IDs are preserved
* proposedBy list accumulates specialist roles

---

## 24. Conflict Resolution

Conflicts are resolved by vote.

If vote does not produce a majority:

```text
needs-review
```

Initial final output includes accepted findings only.

---

## 25. Folder Structure

```text
src/architectures/consensus/
  consensus-architecture.ts
  consensus-coordinator.ts
  consensus-synthesizer.ts
  consensus-session.ts
  consensus-vote.ts
  consensus-decision.ts
  candidate-finding.ts
  index.ts
  README.md
  models/
    consensus-review-result.ts
    consensus-metrics.ts
  prompts/
    README.md
```

If shared specialist code currently lives under Hierarchical, extract common specialist interfaces/parsers carefully.

---

## 26. Testing

Unit tests:

* coordinator state transitions
* independent review dispatch
* finding exchange
* revision collection
* vote collection
* majority acceptance
* majority rejection
* needs-review decision
* duplicate candidate merging
* consensus metrics

Integration test:

```text
sample.diff
  ↓
PR Import
  ↓
Experiment Engine
  ↓
Consensus
  ↓
Validation
  ↓
Storage
  ↓
Evaluation
```

Use `MockProvider`.

No Bedrock calls in unit tests.

---

## 27. Acceptance Criteria

* [ ] ConsensusArchitecture implements `IReviewArchitecture`
* [ ] ConsensusCoordinator implemented
* [ ] ConsensusSynthesizer implemented
* [ ] Independent review round implemented
* [ ] Finding exchange round implemented
* [ ] Revision round implemented
* [ ] Voting round implemented
* [ ] ReviewVote implemented
* [ ] CandidateFinding implemented
* [ ] ConsensusDecision implemented
* [ ] ConsensusReviewResult implemented
* [ ] ConsensusMetrics implemented
* [ ] Majority consensus rule implemented
- [ ] IConsensusProtocol implemented
- [ ] MajorityVoteConsensusProtocol implemented
* [ ] ConversationHistory recorded
* [ ] Uses shared PromptBuilder
* [ ] Uses `ILLMProvider`
* [ ] No direct Bedrock usage
* [ ] No repository access inside architecture
* [ ] Unit tests pass
* [ ] Integration tests pass
* [ ] `npm run check` passes

---

## 28. AI Implementation Checklist

Before submitting:

* [ ] Read RFC-03 Review Framework
* [ ] Read RFC-03.5 LLM Architecture
* [ ] Read RFC-08 Hierarchical Architecture
* [ ] Reuse shared specialist abstractions where appropriate
* [ ] Keep coordinator non-authoritative
* [ ] Preserve peer discussion semantics
* [ ] Keep synthesis deterministic
* [ ] Do not implement dashboard/replay storage
* [ ] Do not implement final evidence scoring
* [ ] Tests included
* [ ] README added or updated

---

## 29. Out of Scope

Do not implement:

* human review
* dashboard visualization
* long-term conversation artifact storage
* statistical testing
* dynamic specialist discovery
* partial consensus
* parallel execution optimization
* LLM-based synthesis
* CSV export

---

## 30. Future Improvements

Future versions may add:

* partial consensus mode
* weighted voting
* confidence-calibrated voting
* architecture agreement scoring
* reviewer-specific reliability weights
* LLM-based synthesis
* peer debate rounds
* dashboard visualization of votes
* persisted conversation artifacts

---

## Summary

# Summary

The Decentralized Consensus Review Architecture completes the platform's three-architecture experimental design.

Unlike Hierarchical Review, which relies on centralized authority, Consensus separates orchestration from decision-making. The `ConsensusCoordinator` manages the lifecycle of a consensus session, while the `IConsensusProtocol` encapsulates the communication algorithm used by participating specialists.

This separation allows multiple consensus protocols—such as majority voting, debate-based consensus, or Delphi-style consensus—to be evaluated without modifying the coordinator or the surrounding experiment infrastructure.

By isolating the communication protocol as the primary experimental variable, the architecture enables rigorous comparison of decentralized multi-agent coordination strategies while maintaining deterministic execution and clean architectural boundaries.