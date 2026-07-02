import { DomainError } from "../shared/errors.ts";

/**
 * Typed errors for the Export Service (RFC-10). `ExportError` is the base (its
 * `code` is `string` so subclasses can override it).
 */
export class ExportError extends DomainError {
  public readonly code: string = "EXPORT_ERROR";
}

/** The requested export format has no registered exporter. */
export class UnsupportedExportFormatError extends ExportError {
  public override readonly code = "UNSUPPORTED_EXPORT_FORMAT";
}

/** Serializing the export content failed. */
export class ExportSerializationError extends ExportError {
  public override readonly code = "EXPORT_SERIALIZATION_ERROR";
}
