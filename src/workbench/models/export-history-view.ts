import type { ExportFormat } from "../../export/index.ts";

/**
 * Metadata about one previously generated export. This is the persisted record
 * the Workbench reads; it deliberately omits the export `content` (large) and
 * carries only what the Export History page renders.
 *
 * It is derived from an RFC-10 {@link ExperimentExportResult} at the time the
 * export was produced — the Workbench never generates exports itself.
 */
export interface ExportRecord {
  readonly format: ExportFormat;
  readonly fileName: string;
  readonly rowCount: number;
  readonly generatedAt: string;
}

/** One row of the Export History page. */
export interface ExportHistoryItemView {
  readonly format: ExportFormat;
  readonly fileName: string;
  readonly rowCount: number;
  readonly generatedAt: string;
}

/**
 * The Export History page (RFC-11 §6): previously generated CSV/JSON exports
 * with their generation time and row count, plus small roll-up counts. Purely a
 * projection of stored {@link ExportRecord}s.
 */
export interface ExportHistoryView {
  readonly items: ExportHistoryItemView[];
  readonly totalExports: number;
  readonly csvCount: number;
  readonly jsonCount: number;
}
