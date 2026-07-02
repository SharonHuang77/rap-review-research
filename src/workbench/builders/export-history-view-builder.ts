import type {
  ExportRecord,
  ExportHistoryView,
} from "../models/export-history-view.ts";
import type { IWorkbenchViewBuilder } from "./workbench-view-builder.ts";

/**
 * Transforms recorded {@link ExportRecord}s into the {@link ExportHistoryView}
 * (RFC-11 §6, Step 8). It only projects and rolls up existing metadata — it
 * never generates an export.
 */
export class ExportHistoryViewBuilder
  implements IWorkbenchViewBuilder<ExportRecord[], ExportHistoryView>
{
  public build(records: ExportRecord[]): ExportHistoryView {
    const items = records.map((r) => ({
      format: r.format,
      fileName: r.fileName,
      rowCount: r.rowCount,
      generatedAt: r.generatedAt,
    }));

    return {
      items,
      totalExports: items.length,
      csvCount: items.filter((i) => i.format === "csv").length,
      jsonCount: items.filter((i) => i.format === "json").length,
    };
  }
}
