import type { BenchmarkResult } from "../models/benchmark-result.ts";
import type { BenchmarkExportRow } from "./benchmark-export-row.ts";

import {
  BENCHMARK_STABLE_COLUMNS,
  toBenchmarkExportRows,
} from "./benchmark-export-row.ts";
import { BenchmarkError } from "../benchmark-errors.ts";

/** The CSV string plus its suggested file name and row count. */
export interface BenchmarkExportResult {
  readonly fileName: string;
  readonly content: string;
  readonly rowCount: number;
  readonly generatedAt: string;
}

/** RFC-4180-style cell escape: undefined→empty, numbers verbatim, quote when needed. */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "number" ? String(value) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serializes {@link BenchmarkResult}s to a CSV research dataset: a header plus
 * one row per architecture per instance, in the stable column order. Returns a
 * string (no file writing) — consistent with the RFC-10 Export Service.
 */
export class BenchmarkCsvExporter {
  public export(
    results: BenchmarkResult[],
    generatedAt: string,
  ): BenchmarkExportResult {
    try {
      const rows = toBenchmarkExportRows(results);
      const header = BENCHMARK_STABLE_COLUMNS.join(",");
      const dataLines = rows.map((row) =>
        BENCHMARK_STABLE_COLUMNS.map((column) => csvCell(row[column])).join(","),
      );
      return {
        fileName: `benchmark-results-${generatedAt.replace(/[:.]/g, "-")}.csv`,
        content: [header, ...dataLines].join("\n"),
        rowCount: rows.length,
        generatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BenchmarkError(`Failed to serialize benchmark CSV: ${message}`);
    }
  }
}

/** Convenience: produce just the CSV string for a set of results. */
export function benchmarkResultsToCsv(
  results: BenchmarkResult[],
  generatedAt: string,
): string {
  return new BenchmarkCsvExporter().export(results, generatedAt).content;
}

export type { BenchmarkExportRow };
