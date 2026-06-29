import { readFileSync } from "node:fs";

/** Read the canonical sample unified diff fixture (a real `.diff` file). */
export function sampleDiff(): string {
  return readFileSync(
    new URL("../../fixtures/sample.diff", import.meta.url),
    "utf8",
  );
}

/** A minimal single-file added diff, for focused parser tests. */
export const ADDED_FILE_DIFF = [
  "diff --git a/docs/guide.md b/docs/guide.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/docs/guide.md",
  "@@ -0,0 +1,2 @@",
  "+# Guide",
  "+Hello",
  "",
].join("\n");
