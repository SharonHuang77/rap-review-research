/**
 * Repository-derived project conventions for the grounding arm (doc 13).
 *
 * Each convention is authored from the repository's OWN published artifacts
 * (linter/formatter configs, EditorConfig, contributor guidelines) and tagged
 * with its `source`. It is repo-level and instance-blind: it never references a
 * specific PR or the injected defect's ground-truth `category` (non-circularity,
 * doc 13 §3). The set is intentionally broader than what any single PR injects —
 * the reviewer is given the project's standing conventions and must decide which,
 * if any, the diff violates.
 *
 * Pilot scope = the two Qodo pilot repositories (aspnetcore, Ghost). The
 * confirmatory arm would replace this hand-mirrored set with automated extraction
 * from each repo's config files.
 */

export interface Convention {
  /** The convention as stated to the reviewer. */
  readonly rule: string;
  /** Where in the repo this comes from (provenance; not shown to the model). */
  readonly source: string;
  /** Distinctive lowercase substrings used to score coverage against GT `category`. */
  readonly matchKeys: readonly string[];
}

export const PROJECT_CONVENTIONS: Record<string, readonly Convention[]> = {
  aspnetcore: [
    { rule: "Use file-scoped namespace declarations.", source: ".editorconfig (csharp_style_namespace_declarations=file_scoped)", matchKeys: ["file-scoped namespace"] },
    { rule: "Opening braces go on a new line (Allman style).", source: ".editorconfig (csharp_new_line_before_open_brace=all)", matchKeys: ["allman", "opening braces must be on new line"] },
    { rule: "Async methods are named with an `Async` suffix.", source: "eng/ analyzers + coding guidelines", matchKeys: ["async suffix"] },
    { rule: "Library code awaits with `ConfigureAwait(false)`.", source: "coding guidelines (library APIs)", matchKeys: ["configureawait"] },
    { rule: "Use curly braces for all control-flow statements.", source: ".editorconfig (csharp_prefer_braces=true)", matchKeys: ["curly braces for all control"] },
    { rule: "Validate parameters with ArgumentNullException throw helpers.", source: "coding guidelines", matchKeys: ["argumentnullexception"] },
    { rule: "Public APIs carry XML documentation comments.", source: "csproj GenerateDocumentationFile + analyzers", matchKeys: ["xml documentation"] },
    { rule: "Prefer primary-constructor syntax where appropriate.", source: ".editorconfig / analyzer preferences", matchKeys: ["primary constructor"] },
    { rule: "Internal implementation classes that are not extended are `sealed`.", source: "analyzers (CA1852) / guidelines", matchKeys: ["sealed"] },
    { rule: "Tests use the xUnit framework.", source: "test project conventions (xUnit)", matchKeys: ["xunit"] },
    { rule: "Test methods follow the Arrange-Act-Assert pattern with comments.", source: "test guidelines", matchKeys: ["arrange-act-assert"] },
    { rule: "Every C# source file begins with the MIT license header.", source: "repo license-header policy", matchKeys: ["mit license header", "license header"] },
  ],
  Ghost: [
    { rule: "Strings use single quotes.", source: "ESLint (quotes: single) via eslint-config-ghost", matchKeys: ["single quote"] },
    { rule: "Statements end with semicolons.", source: "ESLint (semi: always)", matchKeys: ["semicolon"] },
    { rule: "Use strict equality (`===`/`!==`).", source: "ESLint (eqeqeq)", matchKeys: ["strict equality"] },
    { rule: "Declare with `let`/`const`, never `var`.", source: "ESLint (no-var)", matchKeys: ["let or const", "instead of var"] },
    { rule: "Indent with 4 spaces.", source: ".editorconfig / ESLint (indent)", matchKeys: ["4-space indentation", "4 space indentation"] },
    { rule: "The package manager is Yarn v1 (no npm, no package-lock.json).", source: "package.json engines + repo policy", matchKeys: ["yarn"] },
    { rule: "Tailwind CSS classes follow the standard ordering.", source: "prettier-plugin-tailwindcss", matchKeys: ["tailwind"] },
    { rule: "JSX props are sorted in the standard order.", source: "ESLint (react/jsx-sort-props)", matchKeys: ["jsx props"] },
    { rule: "TypeScript files enable strict type checking.", source: "tsconfig (strict: true)", matchKeys: ["strict type checking"] },
    { rule: "Internationalization files use kebab-case names.", source: "i18n directory conventions", matchKeys: ["kebab-case"] },
  ],
};

/** `Ghost-pr-3` → `Ghost`; `aspnetcore-pr-12` → `aspnetcore`. */
export function repoOfInstance(instanceId: string): string {
  return instanceId.replace(/-pr-\d+$/, "");
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The convention (if any) that covers a ground-truth rule `category`, by
 * distinctive-substring match. Used ONLY by the coverage pre-flight — never in
 * the review path — so it cannot leak the injected rule to the reviewer.
 */
export function coversCategory(repo: string, category: string): Convention | undefined {
  const c = norm(category);
  return (PROJECT_CONVENTIONS[repo] ?? []).find((v) => v.matchKeys.some((k) => c.includes(norm(k))));
}

/** The `## Project conventions` block prepended to the review input (grounded arm). */
export function renderConventions(repo: string): string {
  const cs = PROJECT_CONVENTIONS[repo];
  if (!cs || cs.length === 0) return "";
  return (
    `## Project conventions (${repo})\n` +
    `This repository enforces the standing conventions below, derived from its own ` +
    `lint/formatter configs and contributor guidelines. Flag any changed code that ` +
    `violates one of them:\n` +
    cs.map((c) => `- ${c.rule}`).join("\n")
  );
}
