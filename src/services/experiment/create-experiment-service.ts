import type { ExperimentEngineDependencies } from "../../engines/experiment/experiment-engine.ts";
import type { ArchitectureRegistry } from "../../architectures/review-architecture.ts";
import type { ExperimentRepository } from "../../repositories/experiment-repository.ts";
import type { SnapshotRepository } from "../../repositories/snapshot-repository.ts";
import type { IOutputValidator, IEvaluationTrigger } from "../../engines/experiment/ports.ts";
import type { Clock } from "../../shared/clock.ts";
import type { IdGenerator } from "../../shared/id.ts";
import type { Logger } from "../../shared/logger.ts";

import { ExperimentEngine } from "../../engines/experiment/experiment-engine.ts";
import { ExperimentService } from "./experiment-service.ts";
import { InMemoryArchitectureRegistry } from "../../architectures/in-memory-architecture-registry.ts";
import { InMemoryExperimentRepository } from "../../repositories/in-memory/in-memory-experiment-repository.ts";
import { InMemorySnapshotRepository } from "../../repositories/in-memory/in-memory-snapshot-repository.ts";
import { NoopEvaluationTrigger } from "../../engines/experiment/placeholders.ts";
import { ValidationEngine } from "../../validation/index.ts";
import { SystemClock } from "../../shared/clock.ts";
import { DefaultIdGenerator } from "../../shared/id.ts";
import { NoopLogger } from "../../shared/logger.ts";

/**
 * Overrides for the composition root. Any collaborator can be replaced (e.g.
 * with a test double or a future real implementation); anything omitted falls
 * back to an in-memory / placeholder default.
 */
export type ExperimentServiceOverrides = Partial<ExperimentEngineDependencies>;

/**
 * The fully-wired object graph produced by {@link createExperimentService}.
 *
 * The concrete collaborators are returned alongside the service so callers
 * (and tests) can seed snapshots and register architectures.
 */
export interface ExperimentServiceContext {
  readonly service: ExperimentService;
  readonly engine: ExperimentEngine;
  readonly experiments: ExperimentRepository;
  readonly snapshots: SnapshotRepository;
  readonly registry: ArchitectureRegistry;
  readonly validator: IOutputValidator;
  readonly evaluator: IEvaluationTrigger;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
}

/**
 * Composition root: assemble an {@link ExperimentService} backed by in-memory
 * repositories, an empty architecture registry, and placeholder validation /
 * evaluation ports.
 *
 * No database, AWS, or LLM provider is involved — exactly as required by
 * RFC-01. Real adapters are injected via `overrides` as later RFCs land.
 */
export function createExperimentService(
  overrides: ExperimentServiceOverrides = {},
): ExperimentServiceContext {
  const experiments =
    overrides.experiments ?? new InMemoryExperimentRepository();
  const snapshots = overrides.snapshots ?? new InMemorySnapshotRepository();
  const registry = overrides.registry ?? new InMemoryArchitectureRegistry();
  const validator = overrides.validator ?? new ValidationEngine();
  const evaluator = overrides.evaluator ?? new NoopEvaluationTrigger();
  const clock = overrides.clock ?? new SystemClock();
  const idGenerator = overrides.idGenerator ?? new DefaultIdGenerator();
  const logger = overrides.logger ?? new NoopLogger();

  const engine = new ExperimentEngine({
    experiments,
    snapshots,
    registry,
    validator,
    evaluator,
    clock,
    idGenerator,
    logger,
  });

  const service = new ExperimentService(engine, logger);

  return {
    service,
    engine,
    experiments,
    snapshots,
    registry,
    validator,
    evaluator,
    clock,
    idGenerator,
    logger,
  };
}
