import type { ExperimentExportInput } from "../models/experiment-export-input.ts";
import type { ExperimentExportResult } from "../models/experiment-export-result.ts";
import type { IExperimentExporter } from "./experiment-exporter.ts";

import { exportFileName } from "../models/experiment-export-result.ts";
import { ExportSerializationError } from "../export-errors.ts";

/**
 * Exports comparisons as formatted JSON, preserving the full
 * `ExperimentComparison[]` structure. Computes no metrics.
 */
export class JsonExperimentExporter implements IExperimentExporter {
  public readonly format = "json" as const;

  public async export(
    input: ExperimentExportInput,
  ): Promise<ExperimentExportResult> {
    try {
      const content = JSON.stringify(input.comparisons, null, 2);
      const rowCount = input.comparisons.reduce(
        (count, comparison) => count + comparison.architectures.length,
        0,
      );
      return {
        format: "json",
        fileName: exportFileName("json", input.generatedAt),
        content,
        rowCount,
        generatedAt: input.generatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExportSerializationError(`Failed to serialize JSON: ${message}`);
    }
  }
}
