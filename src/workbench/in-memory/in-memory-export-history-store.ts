import type { ExperimentExportResult } from "../../export/index.ts";
import type { ExportRecord } from "../models/export-history-view.ts";
import type { ExportHistoryReadPort } from "../ports.ts";

/**
 * In-memory {@link ExportHistoryReadPort}. The Workbench records export metadata
 * here at the moment an export is produced by the RFC-10 Export Service — it
 * never generates exports itself. Stores only metadata, never the (large)
 * export `content`.
 */
export class InMemoryExportHistoryStore implements ExportHistoryReadPort {
  private readonly records: ExportRecord[] = [];

  /** Record the metadata of an RFC-10 export result. */
  public record(result: ExperimentExportResult): void {
    this.records.push({
      format: result.format,
      fileName: result.fileName,
      rowCount: result.rowCount,
      generatedAt: result.generatedAt,
    });
  }

  public async list(): Promise<ExportRecord[]> {
    return this.records.map((r) => ({ ...r }));
  }
}
