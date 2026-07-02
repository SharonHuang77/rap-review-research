/**
 * Public barrel for the Validation & Result Processing Engine (RFC-05).
 */
export { ValidationEngine } from "./validation-engine.ts";
export type { ValidationEngineDependencies } from "./validation-engine.ts";

export { ResponseCleaner } from "./response-cleaner.ts";
export type { CleanResult } from "./response-cleaner.ts";
export { JSONExtractor } from "./json-extractor.ts";
export type { ExtractResult } from "./json-extractor.ts";
export { SchemaValidator } from "./schema-validator.ts";
export { ResultNormalizer } from "./result-normalizer.ts";
export type { NormalizeResult } from "./result-normalizer.ts";

export {
  ValidationError,
  JSONExtractionError,
  SchemaValidationError,
  NormalizationError,
} from "./validation-errors.ts";

export {
  reviewResultInputSchema,
  SCHEMA_VERSION,
} from "./schemas/review-result-schema.ts";
export type { ReviewResultInput } from "./schemas/review-result-schema.ts";
export { reviewFindingInputSchema } from "./schemas/review-finding-schema.ts";
export type { ReviewFindingInput } from "./schemas/review-finding-schema.ts";
