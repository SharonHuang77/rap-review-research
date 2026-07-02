/**
 * A pluggable transform from a domain model (`TInput`) to a presentation model
 * (`TOutput`), RFC-11 Step 4.
 *
 * Builders are the only place domain→presentation shaping happens; the services
 * orchestrate and the builders transform. This mirrors the strategy/plugin
 * contracts used across the platform (IReviewArchitecture, ILLMProvider,
 * IReviewSpecialist, IConsensusProtocol, IExperimentExporter).
 *
 * Builders are pure and synchronous: given the same input they return the same
 * output, and they perform no I/O and no metric calculation.
 */
export interface IWorkbenchViewBuilder<TInput, TOutput> {
  build(input: TInput): TOutput;
}
