## Evaluation Design

### E1. Controlled Defect Detection — Qodo PR-Review-Bench
Use Qodo as the primary quantitative benchmark.
Metrics: precision, recall, F1, localization accuracy, cost, latency.

### E2. Human Review Agreement — SWE-PRBench
Use SWE-PRBench as a secondary validation benchmark.
Metrics: issue coverage, semantic agreement, false positives, cost, latency.

### E3. RAP Portal Case Study
Use real RAP Portal PRs to demonstrate ecological validity.
Metrics: evidenceScore, architectureAgreement, finding count, cost, latency, llmCalls, messageCount.

### E4. Cross-Architecture Comparison
Run Agentless, Hierarchical, and Consensus on the same PR snapshots.
The independent variable is architecture; snapshot, model, prompt version, and evaluation script are controlled.
