import type {
  ChangedFile,
  ChangedLineRange,
  FileChangeType,
} from "../../models/snapshot.ts";

/**
 * The result of parsing a unified diff.
 */
export interface ParsedDiff {
  readonly files: ChangedFile[];
  /** Sum of additions + deletions across all files. */
  readonly totalChangedLines: number;
}

/**
 * Parses a raw unified diff into structured changed-file metadata.
 */
export interface IDiffParser {
  parse(rawDiff: string): ParsedDiff;
}

/** Mutable accumulator used while parsing a single file section. */
interface FileAccumulator {
  path: string;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
  ranges: ChangedLineRange[];
  oldLine: number;
  newLine: number;
  pendingAdded: { start: number; end: number } | null;
  pendingRemoved: { start: number; end: number } | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Basic unified-diff parser (RFC-02).
 *
 * Responsibilities: split a unified diff into per-file sections, determine each
 * file's change type and path, count additions/deletions, and group changed
 * lines into contiguous ranges (added ranges in new-file coordinates, removed
 * ranges in old-file coordinates).
 *
 * It is intentionally minimal — enough for manual `.diff` uploads — and performs
 * no semantic analysis of the code itself.
 */
export class UnifiedDiffParser implements IDiffParser {
  public parse(rawDiff: string): ParsedDiff {
    const files: FileAccumulator[] = [];
    let current: FileAccumulator | null = null;

    for (const line of rawDiff.split("\n")) {
      if (line.startsWith("diff --git ")) {
        current = this.startFile(files, this.pathFromGitHeader(line));
        continue;
      }
      if (current === null) {
        continue; // preamble before the first file header
      }
      current = this.consumeLine(current, line);
    }

    this.flushRanges(current);
    return this.finalize(files);
  }

  private startFile(
    files: FileAccumulator[],
    path: string,
  ): FileAccumulator {
    this.flushRanges(files[files.length - 1] ?? null);
    const accumulator: FileAccumulator = {
      path,
      changeType: "modified",
      additions: 0,
      deletions: 0,
      ranges: [],
      oldLine: 0,
      newLine: 0,
      pendingAdded: null,
      pendingRemoved: null,
    };
    files.push(accumulator);
    return accumulator;
  }

  /** Apply one diff line to the current file accumulator. */
  private consumeLine(file: FileAccumulator, line: string): FileAccumulator {
    if (this.applyHeaderLine(file, line)) {
      return file;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      this.flushRanges(file);
      file.oldLine = Number(hunk[1]);
      file.newLine = Number(hunk[2]);
      return file;
    }

    if (line.startsWith("+")) {
      this.applyAddition(file);
    } else if (line.startsWith("-")) {
      this.applyDeletion(file);
    } else if (!line.startsWith("\\")) {
      // Context line (or the empty trailing line); advances both sides.
      this.flushRanges(file);
      file.oldLine += 1;
      file.newLine += 1;
    }
    return file;
  }

  /** Handle file-header lines (`---`, `+++`, mode/rename markers). */
  private applyHeaderLine(file: FileAccumulator, line: string): boolean {
    if (line.startsWith("new file mode") || line.startsWith("--- /dev/null")) {
      file.changeType = "added";
      return true;
    }
    if (
      line.startsWith("deleted file mode") ||
      line.startsWith("+++ /dev/null")
    ) {
      file.changeType = "deleted";
      return true;
    }
    if (line.startsWith("rename from") || line.startsWith("rename to")) {
      file.changeType = "renamed";
      return true;
    }
    if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null")) {
      file.path = this.stripPrefix(line.slice(4).trim());
      return true;
    }
    if (line.startsWith("--- ")) {
      return true; // old path; new path (or git header) is authoritative
    }
    return false;
  }

  private applyAddition(file: FileAccumulator): void {
    this.flushRemoved(file);
    file.additions += 1;
    if (file.pendingAdded) {
      file.pendingAdded.end = file.newLine;
    } else {
      file.pendingAdded = { start: file.newLine, end: file.newLine };
    }
    file.newLine += 1;
  }

  private applyDeletion(file: FileAccumulator): void {
    this.flushAdded(file);
    file.deletions += 1;
    if (file.pendingRemoved) {
      file.pendingRemoved.end = file.oldLine;
    } else {
      file.pendingRemoved = { start: file.oldLine, end: file.oldLine };
    }
    file.oldLine += 1;
  }

  private flushAdded(file: FileAccumulator): void {
    if (file.pendingAdded) {
      file.ranges.push({
        startLine: file.pendingAdded.start,
        endLine: file.pendingAdded.end,
        changeType: "added",
      });
      file.pendingAdded = null;
    }
  }

  private flushRemoved(file: FileAccumulator): void {
    if (file.pendingRemoved) {
      file.ranges.push({
        startLine: file.pendingRemoved.start,
        endLine: file.pendingRemoved.end,
        changeType: "removed",
      });
      file.pendingRemoved = null;
    }
  }

  private flushRanges(file: FileAccumulator | null): void {
    if (!file) {
      return;
    }
    this.flushAdded(file);
    this.flushRemoved(file);
  }

  private finalize(files: FileAccumulator[]): ParsedDiff {
    const changedFiles: ChangedFile[] = files.map((file) => ({
      path: file.path,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions,
      changedLineRanges: file.ranges,
    }));
    const totalChangedLines = changedFiles.reduce(
      (sum, file) => sum + file.additions + file.deletions,
      0,
    );
    return { files: changedFiles, totalChangedLines };
  }

  private pathFromGitHeader(line: string): string {
    // Format: `diff --git a/<path> b/<path>`
    const parts = line.slice("diff --git ".length).trim().split(" ");
    const candidate = parts[parts.length - 1] ?? "";
    return this.stripPrefix(candidate);
  }

  private stripPrefix(path: string): string {
    if (path.startsWith("a/") || path.startsWith("b/")) {
      return path.slice(2);
    }
    return path;
  }
}
