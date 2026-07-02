import { readFileSync, existsSync } from "node:fs";

import { PromptNotFoundError } from "../errors.ts";

export interface PromptLoaderOptions {
  /**
   * Base directory containing version folders. Defaults to the bundled
   * `templates/` directory next to this module. Injectable for tests.
   */
  readonly baseDir?: URL;
}

/**
 * Loads version-controlled prompt templates from external Markdown files.
 *
 * Layout: `<baseDir>/<version>/<category>/<name>.md`
 * (e.g. `templates/v1/common/review-instructions.md`).
 *
 * Templates are read from disk and cached. Prompts are never hardcoded in
 * source — this loader is the only way the platform reads them.
 */
export class PromptLoader {
  private readonly baseDir: URL;
  private readonly cache = new Map<string, string>();

  public constructor(options: PromptLoaderOptions = {}) {
    this.baseDir = options.baseDir ?? new URL("./templates/", import.meta.url);
  }

  /** Whether a template exists for the given coordinates. */
  public has(version: string, category: string, name: string): boolean {
    return existsSync(this.urlFor(version, category, name));
  }

  /**
   * Load a template's contents.
   * @throws PromptNotFoundError when the template does not exist.
   */
  public load(version: string, category: string, name: string): string {
    const key = `${version}/${category}/${name}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const url = this.urlFor(version, category, name);
    if (!existsSync(url)) {
      throw new PromptNotFoundError(`Prompt template not found: ${key}.md`);
    }
    const content = readFileSync(url, "utf8");
    this.cache.set(key, content);
    return content;
  }

  private urlFor(version: string, category: string, name: string): URL {
    return new URL(`${version}/${category}/${name}.md`, this.baseDir);
  }
}
