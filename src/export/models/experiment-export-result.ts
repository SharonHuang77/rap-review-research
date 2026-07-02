import type { ExportFormat } from "./experiment-export-input.ts";

/**
 * The result of an export: the generated content as a string plus metadata.
 * Writing to disk/S3 is out of scope (a later persistence RFC).
 */
export interface ExperimentExportResult {
  readonly format: ExportFormat;
  readonly fileName: string;
  readonly content: string;
  readonly rowCount: number;
  readonly generatedAt: string;
}

/** Build a deterministic file name (not written anywhere; metadata only). */
export function exportFileName(format: ExportFormat, generatedAt: string): string {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  return `experiment-comparisons-${stamp}.${format}`;
}
