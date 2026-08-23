import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { digestText } from "../src/canonical.js";
import { SCHEMA_CONTRACT } from "../src/version.js";
import type {
  ContractRule,
  ContributionContract,
  EvaluationSnapshot,
  RecordedCommand,
} from "../src/types.js";

const execFile = promisify(execFileCallback);

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function stageFixture(name: string): Promise<string> {
  const src = join(repoRoot, "fixtures", "repos", name);
  const dest = await mkdtemp(join(tmpdir(), `ck-${name}-`));
  await cp(src, dest, { recursive: true });
  const overlay = join(dest, "change");
  if (existsSync(overlay)) {
    await rm(overlay, { recursive: true, force: true });
  }
  await execFile("git", ["init", "-b", "main"], { cwd: dest });
  await execFile("git", ["config", "user.email", "dev@example.com"], { cwd: dest });
  await execFile("git", ["config", "user.name", "Dev"], { cwd: dest });
  await execFile("git", ["add", "-A"], { cwd: dest });
  await execFile("git", ["commit", "-m", "base"], { cwd: dest });
  const changeSrc = join(src, "change");
  if (existsSync(changeSrc)) {
    await cp(changeSrc, dest, { recursive: true });
  }
  return dest;
}

export function emptySnapshot(over: Partial<EvaluationSnapshot> = {}): EvaluationSnapshot {
  const snapshot: EvaluationSnapshot = {
    diffStat: over.diffStat ?? { files: 1, insertions: 3, deletions: 0 },
    changedPaths: over.changedPaths ?? ["src/a.ts"],
    commitMessages: over.commitMessages ?? ["fix: tweak"],
    prBodyDraft: over.prBodyDraft ?? "",
    recordedCommands: over.recordedCommands ?? [],
    gitAuthor: over.gitAuthor ?? "Dev <dev@example.com>",
  };
  if (over.branchName !== undefined) snapshot.branchName = over.branchName;
  if (over.pathDiffs !== undefined) snapshot.pathDiffs = over.pathDiffs;
  return snapshot;
}

export function blockRule(over: Partial<ContractRule> & Pick<ContractRule, "id" | "check" | "message">): ContractRule {
  const rule: ContractRule = {
    id: over.id,
    severity: over.severity ?? "block",
    origin: over.origin ?? "CONTRIBUTING.md:1",
    check: over.check,
    message: over.message,
  };
  if (over.path !== undefined) rule.path = over.path;
  if (over.pattern !== undefined) rule.pattern = over.pattern;
  if (over.command !== undefined) rule.command = over.command;
  if (over.max !== undefined) rule.max = over.max;
  if (over.glob !== undefined) rule.glob = over.glob;
  if (over.ignore !== undefined) rule.ignore = over.ignore;
  if (over.patterns !== undefined) rule.patterns = over.patterns;
  if (over.keys !== undefined) rule.keys = over.keys;
  return rule;
}

export function makeContract(
  rules: ContractRule[],
  advisory: ContractRule[] = [],
  needsHuman: ContractRule[] = [],
): ContributionContract {
  return {
    schema: SCHEMA_CONTRACT,
    ref: "abc123",
    sources: [{ path: "CONTRIBUTING.md", digest: digestText("# contributing\n") }],
    rules,
    advisory,
    needsHuman,
  };
}

export function recorded(command: string, exitCode: number, logDigest?: string): RecordedCommand {
  const item: RecordedCommand = { command, exitCode, source: "executed" };
  if (logDigest !== undefined) item.logDigest = logDigest;
  return item;
}
