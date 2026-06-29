/**
 * Public barrel for the PR Import Engine module.
 */
export type {
  IPRImportEngine,
  PRImportEngineDependencies,
} from "./pr-import-engine.ts";
export { PRImportEngine } from "./pr-import-engine.ts";

export type { IDiffParser, ParsedDiff } from "./diff-parser.ts";
export { UnifiedDiffParser } from "./diff-parser.ts";

export {
  classifyFile,
  classifyCategory,
  classifyComplexity,
} from "./classification.ts";
