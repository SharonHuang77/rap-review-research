/**
 * Public barrel for the Experiment Engine module.
 */
export type {
  IExperimentEngine,
  ExperimentEngineDependencies,
} from "./experiment-engine.ts";
export { ExperimentEngine } from "./experiment-engine.ts";

export type { IOutputValidator, IEvaluationTrigger } from "./ports.ts";
export {
  PassthroughOutputValidator,
  NoopEvaluationTrigger,
} from "./placeholders.ts";
