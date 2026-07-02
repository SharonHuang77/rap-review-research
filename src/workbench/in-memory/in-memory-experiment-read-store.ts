import type { Experiment } from "../../models/experiment.ts";
import type { ExperimentReadPort } from "../ports.ts";

/**
 * In-memory {@link ExperimentReadPort} for development and tests. Seeded via
 * {@link add}; `list()` returns experiments in insertion order.
 *
 * The Workbench owns this read store rather than reusing the RFC-01 write-side
 * repository, which exposes no listing capability. Reads return shallow copies
 * so callers cannot mutate stored state.
 */
export class InMemoryExperimentReadStore implements ExperimentReadPort {
  private readonly byId = new Map<string, Experiment>();
  private readonly order: string[] = [];

  /** Seed or replace an experiment. */
  public add(experiment: Experiment): void {
    if (!this.byId.has(experiment.experimentId)) {
      this.order.push(experiment.experimentId);
    }
    this.byId.set(experiment.experimentId, { ...experiment });
  }

  public async list(): Promise<Experiment[]> {
    return this.order.map((id) => ({ ...(this.byId.get(id) as Experiment) }));
  }

  public async getById(experimentId: string): Promise<Experiment | null> {
    const found = this.byId.get(experimentId);
    return found ? { ...found } : null;
  }
}
