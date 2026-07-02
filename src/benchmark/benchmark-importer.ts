import type { IPRImportService } from "../services/snapshot/pr-import-service.ts";
import type { BenchmarkDataset } from "./models/benchmark-dataset.ts";
import type { BenchmarkInstance } from "./models/benchmark-instance.ts";

import { BenchmarkRunError } from "./benchmark-errors.ts";

/** A benchmark instance paired with the snapshot it was imported into. */
export interface ImportedBenchmarkInstance {
  readonly instance: BenchmarkInstance;
  readonly snapshotId: string;
}

export interface ImportOptions {
  /** Import only the first N instances (subset import). */
  readonly limit?: number;
}

/**
 * Imports benchmark instances into immutable PR snapshots via the existing PR
 * Import Engine (RFC-02), so every architecture reviews identical input. Adds no
 * review or persistence logic of its own.
 */
export class BenchmarkImporter {
  private readonly importService: IPRImportService;

  public constructor(importService: IPRImportService) {
    this.importService = importService;
  }

  public async import(
    dataset: BenchmarkDataset,
    options: ImportOptions = {},
  ): Promise<ImportedBenchmarkInstance[]> {
    const instances =
      options.limit !== undefined
        ? dataset.instances.slice(0, options.limit)
        : dataset.instances;

    const imported: ImportedBenchmarkInstance[] = [];
    for (const instance of instances) {
      try {
        const result = await this.importService.importManualDiff({
          title: instance.title,
          // Benchmark diffs are treated as synthetic uploads.
          source: "synthetic",
          rawDiff: instance.rawDiff,
        });
        imported.push({ instance, snapshotId: result.snapshotId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BenchmarkRunError(
          `Failed to import benchmark instance "${instance.instanceId}": ${message}`,
        );
      }
    }
    return imported;
  }
}
