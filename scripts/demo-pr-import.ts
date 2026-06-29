/**
 * Demo: import a manual unified diff into an immutable PR Snapshot (RFC-02).
 *
 * Run with: `npm run demo:import`
 *
 * No GitHub, S3, or DynamoDB — in-memory storage and a ConsoleLogger so the
 * import log line is visible.
 */
import { createPRImportService } from "../src/services/snapshot/index.ts";
import { ConsoleLogger } from "../src/shared/logger.ts";

const SAMPLE_DIFF = [
  "diff --git a/src/api/users.ts b/src/api/users.ts",
  "--- a/src/api/users.ts",
  "+++ b/src/api/users.ts",
  "@@ -10,7 +10,9 @@ export function getUsers() {",
  "   const users = db.query();",
  "-  return users;",
  "+  if (!users) {",
  "+    return [];",
  "+  }",
  "+  return users.filter(Boolean);",
  " }",
  "diff --git a/src/components/UserList.tsx b/src/components/UserList.tsx",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/components/UserList.tsx",
  "@@ -0,0 +1,3 @@",
  "+export function UserList() {",
  "+  return null;",
  "+}",
  "",
].join("\n");

const ctx = createPRImportService({ logger: new ConsoleLogger() });

const result = await ctx.service.importManualDiff({
  title: "Add user filtering + list component",
  description: "Manual diff import demo.",
  source: "manual",
  rawDiff: SAMPLE_DIFF,
});

const snapshot = await ctx.snapshots.getById(result.snapshotId);

console.log("\n--- import result ---");
console.log(JSON.stringify(result, null, 2));
console.log("\n--- snapshot ---");
console.log(JSON.stringify(snapshot, null, 2));
