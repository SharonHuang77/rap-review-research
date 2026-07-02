/**
 * Public barrel for the Experiment Engine module.
 */
export type {
  IExperimentEngine,
  ExperimentEngineDependencies,
} from "./experiment-engine.ts";
export { ExperimentEngine } from "./experiment-engine.ts";

export type {
  IOutputValidator,
  IEvaluationTrigger,
  OutputValidationContext,
} from "./ports.ts";
export { NoopEvaluationTrigger } from "./placeholders.ts";
