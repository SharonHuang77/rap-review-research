import type { ExperimentExportInput } from "../models/experiment-export-input.ts";
import type { ExperimentExportResult } from "../models/experiment-export-result.ts";
import type { IExperimentExporter } from "./experiment-exporter.ts";

import { exportFileName } from "../models/experiment-export-result.ts";
import {
  STABLE_COLUMNS,
  toResearchExportRows,
} from "../models/research-export-row.ts";
import { ExportSerializationError } from "../export-errors.ts";

/**
 * Exports comparisons as CSV: a header row plus one row per architecture per
 * comparison, in the stable column order. Escapes commas/quotes/newlines,
 * renders undefined optionals as empty strings, and preserves numeric values
 * verbatim. Computes no metrics.
 */
export class CsvExperimentExporter implements IExperimentExporter {
  public readonly format = "csv" as const;

  public async export(
    input: ExperimentExportInput,
  ): Promise<ExperimentExportResult> {
    try {
      const rows = toResearchExportRows(input.comparisons);
      const header = STABLE_COLUMNS.join(",");
      const dataLines = rows.map((row) =>
        STABLE_COLUMNS.map((column) => csvCell(row[column])).join(","),
      );
      const content = [header, ...dataLines].join("\n");
      return {
        format: "csv",
        fileName: exportFileName("csv", input.generatedAt),
        content,
        rowCount: rows.length,
        generatedAt: input.generatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExportSerializationError(`Failed to serialize CSV: ${message}`);
    }
  }
}

/** Escape one CSV cell. Undefined → empty; numbers verbatim; quote when needed. */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "number" ? String(value) : value;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
