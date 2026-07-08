# Generalists Control Arm (`generalists-3`) — roadmap C1

The compute-matched control between Agentless and Hierarchical. Runs the
generalist (Agentless) prompt `sampleCount` times (default 3) at
`sampleTemperature` (default 0.7), in parallel, then merges the samples with the
**same deterministic `Synthesizer`** the Hierarchical arm uses.

```
agentless (1)  --+compute-->  generalists-3 (3 + merge)  --+roles-->  hierarchical  --+comm-->  consensus
```

- `llmCalls = sampleCount`; `messageCount = sampleCount` with **zero inter-agent
  messages** (more compute, no communication).
- Dual latency (B3): `latencyMs` = sum of samples; `criticalPathLatencyMs` = the
  slowest sample. Truncation (B2): `truncatedCallCount` = truncated samples.

## Threat to validity — temperature

This is the only arm that runs at temperature > 0; the others run at
temperature 0. Identical-prompt sampling at temperature 0 would be degenerate
(three identical outputs), so a non-zero temperature is intrinsic to
self-consistency. `sampleTemperature` is frozen alongside the prompts and must
be reported in the results.

## Usage

`registry.register(createGeneralistsArchitecture({ provider, promptBuilder, rawDiffStorage }))`
Then run an experiment with `architecture: "generalists-3"`. Not part of the
default `ALL_ARCHITECTURES` benchmark set — opt in via
`BenchmarkExecutionConfig.architectures`.
