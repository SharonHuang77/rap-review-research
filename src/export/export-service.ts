import type {
  ExportFormat,
  ExperimentExportInput,
} from "./models/experiment-export-input.ts";
import type { ExperimentExportResult } from "./models/experiment-export-result.ts";
import type { ExporterRegistry } from "./exporter-registry.ts";

import { InMemoryExporterRegistry } from "./exporter-registry.ts";
import { CsvExperimentExporter } from "./exporters/csv-experiment-exporter.ts";
import { JsonExperimentExporter } from "./exporters/json-experiment-exporter.ts";
import { ExportError } from "./export-errors.ts";

export interface IExportService {
  exportComparisons(
    input: ExperimentExportInput,
    format: ExportFormat,
  ): Promise<ExperimentExportResult>;
}

/**
 * Selects the exporter for the requested format and produces export content.
 *
 * It computes no metrics — it consumes the RFC-07 evaluation output — and never
 * touches repositories, the LLM, or the filesystem.
 */
export class ExportService implements IExportService {
  private readonly registry: ExporterRegistry;

  public constructor(registry: ExporterRegistry) {
    this.registry = registry;
  }

  public async exportComparisons(
    input: ExperimentExportInput,
    format: ExportFormat,
  ): Promise<ExperimentExportResult> {
    if (!Array.isArray(input.comparisons)) {
      throw new ExportError("Export input `comparisons` must be an array.");
    }
    // Throws UnsupportedExportFormatError for an unknown format.
    const exporter = this.registry.get(format);
    return exporter.export(input);
  }
}

/**
 * Composition helper: an Export Service with the built-in CSV and JSON
 * exporters registered.
 */
export function createExportService(): ExportService {
  const registry = new InMemoryExporterRegistry();
  registry.register(new CsvExperimentExporter());
  registry.register(new JsonExperimentExporter());
  return new ExportService(registry);
}
