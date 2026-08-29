import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { compareTextUnit } from "./canonical.js";
import type { EvaluationSnapshot, PathDiff, RecordedCommand } from "./types.js";

const execFile = promisify(execFileCallback);

const TEXT_CAP = 1_000_000;

export class RepoError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "RepoError";
    this.exitCode = exitCode;
  }
}

export async function git(
  cwd: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFile("git", [...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10_000_000,
      timeout: 30_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.message ?? "git failed",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
}

async function samePath(left: string, right: string): Promise<boolean> {
  try {
    return (await realpath(left)) === (await realpath(right));
  } catch {
    return resolve(left) === resolve(right);
  }
}

/** True only when repoPath is a git *root*, not a nested folder of another repo. */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  const abs = resolve(repoPath);
  const result = await git(abs, ["rev-parse", "--show-toplevel"]);
  if (result.code !== 0) return false;
  const top = result.stdout.trim();
  if (top.length === 0) return false;
  return samePath(abs, top);
}

export async function resolveRef(repoPath: string, ref: string): Promise<string> {
  const result = await git(repoPath, ["rev-parse", "--verify", ref]);
  if (result.code !== 0) {
    throw new RepoError(`cannot resolve git ref ${ref}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

export async function remoteUrl(repoPath: string): Promise<string | undefined> {
  const result = await git(repoPath, ["remote", "get-url", "origin"]);
  if (result.code !== 0) return undefined;
  const url = result.stdout.trim();
  return url.length > 0 ? url : undefined;
}

export async function currentBranch(repoPath: string): Promise<string | undefined> {
  const result = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (result.code !== 0) return undefined;
  const name = result.stdout.trim();
  return name.length > 0 ? name : undefined;
}

export async function gitAuthor(repoPath: string): Promise<string> {
  const log = await git(repoPath, ["log", "-1", "--format=%an <%ae>"]);
  if (log.code === 0 && log.stdout.trim().length > 0) return log.stdout.trim();
  const name = await git(repoPath, ["config", "user.name"]);
  const email = await git(repoPath, ["config", "user.email"]);
  const n = name.stdout.trim() || "unknown";
  const e = email.stdout.trim();
  return e.length > 0 ? `${n} <${e}>` : n;
}

export async function readAtRef(
  repoPath: string,
  ref: string,
  filePath: string,
): Promise<string | undefined> {
  if (await isGitRepo(repoPath)) {
    const shown = await git(repoPath, ["show", `${ref}:${filePath}`]);
    if (shown.code === 0) {
      return shown.stdout.length > TEXT_CAP ? shown.stdout.slice(0, TEXT_CAP) : shown.stdout;
    }
    return undefined;
  }
  const abs = join(repoPath, filePath);
  if (!existsSync(abs)) return undefined;
  try {
    const info = await stat(abs);
    if (!info.isFile()) return undefined;
    const buf = await readFile(abs);
    return buf.subarray(0, TEXT_CAP).toString("utf8");
  } catch {
    return undefined;
  }
}

export async function firstExisting(
  repoPath: string,
  ref: string,
  candidates: readonly string[],
): Promise<{ path: string; text: string } | undefined> {
  for (const path of candidates) {
    const text = await readAtRef(repoPath, ref, path);
    if (text !== undefined) return { path, text };
  }
  return undefined;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const parts = text.split(/\n/);
  const last = parts[parts.length - 1];
  return last === "" ? parts.length - 1 : parts.length;
}

async function untrackedFiles(repoPath: string): Promise<string[]> {
  const listed = await git(repoPath, ["ls-files", "-o", "--exclude-standard"]);
  if (listed.code !== 0) return [];
  return listed.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseNumstat(stdout: string): PathDiff[] {
  const diffs: PathDiff[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const parts = line.split("\t");
    const insRaw = parts[0];
    const delRaw = parts[1];
    const path = parts[2];
    if (insRaw === undefined || delRaw === undefined || path === undefined) continue;
    const insertions = insRaw === "-" ? 0 : Number.parseInt(insRaw, 10);
    const deletions = delRaw === "-" ? 0 : Number.parseInt(delRaw, 10);
    diffs.push({
      path,
      insertions: Number.isFinite(insertions) ? insertions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return diffs;
}

export async function commitMessagesSince(repoPath: string, baseRef: string): Promise<string[]> {
  const range = await git(repoPath, ["log", "--format=%B%x1f", `${baseRef}..HEAD`]);
  const messages: string[] = [];
  if (range.code === 0 && range.stdout.trim().length > 0) {
    for (const part of range.stdout.split("\x1f")) {
      const text = part.trim();
      if (text.length > 0) messages.push(text);
    }
  }
  if (messages.length === 0) {
    const head = await git(repoPath, ["log", "-1", "--format=%B"]);
    if (head.code === 0 && head.stdout.trim().length > 0) messages.push(head.stdout.replace(/\n+$/, ""));
  }
  return messages;
}

export async function buildSnapshot(
  repoPath: string,
  baseRef: string,
  extra: {
    prBodyDraft?: string;
    recordedCommands?: RecordedCommand[];
  } = {},
): Promise<EvaluationSnapshot> {
  const abs = resolve(repoPath);
  if (!(await isGitRepo(abs))) {
    throw new RepoError(
      `not a git repository root: ${abs}. Pass the clone root via --repo, or git init that directory. Nested folders of another repo are not used as a substitute.`,
    );
  }
  await resolveRef(abs, baseRef);

  const numstat = await git(abs, ["diff", "--numstat", baseRef]);
  if (numstat.code !== 0) {
    throw new RepoError(`git diff failed against ${baseRef}: ${numstat.stderr.trim()}`);
  }
  const diffs = parseNumstat(numstat.stdout);
  const seen = new Set(diffs.map((row) => row.path));

  for (const path of await untrackedFiles(abs)) {
    if (seen.has(path)) continue;
    seen.add(path);
    let insertions = 0;
    try {
      const buf = await readFile(join(abs, path));
      if (buf.includes(0)) {
        insertions = 0;
      } else {
        insertions = countLines(buf.subarray(0, TEXT_CAP).toString("utf8"));
      }
    } catch {
      insertions = 0;
    }
    diffs.push({ path, insertions, deletions: 0 });
  }

  diffs.sort((a, b) => compareTextUnit(a.path, b.path));
  const changedPaths = diffs.map((row) => row.path);
  let insertions = 0;
  let deletions = 0;
  for (const row of diffs) {
    insertions += row.insertions;
    deletions += row.deletions;
  }

  const author = await gitAuthor(abs);
  const branch = await currentBranch(abs);
  const messages = await commitMessagesSince(abs, baseRef);

  const snapshot: EvaluationSnapshot = {
    diffStat: { files: changedPaths.length, insertions, deletions },
    changedPaths,
    commitMessages: messages,
    prBodyDraft: extra.prBodyDraft ?? "",
    recordedCommands: extra.recordedCommands ?? [],
    gitAuthor: author,
  };
  if (branch !== undefined) snapshot.branchName = branch;
  if (diffs.length > 0) snapshot.pathDiffs = diffs;
  return snapshot;
}

export const CONTRACT_CANDIDATES = {
  license: ["LICENSE", "LICENSE.md", "LICENCE", "LICENCE.md"] as const,
  contributing: [
    "CONTRIBUTING.md",
    "CONTRIBUTING",
    ".github/CONTRIBUTING.md",
    "docs/CONTRIBUTING.md",
  ] as const,
  prTemplate: [
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
  ] as const,
  codeowners: [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"] as const,
  policy: ["contribkit.yml"] as const,
  packageJson: ["package.json"] as const,
  lockNpm: ["package-lock.json"] as const,
  lockPnpm: ["pnpm-lock.yaml"] as const,
  lockYarn: ["yarn.lock"] as const,
  lockBun: ["bun.lock", "bun.lockb"] as const,
  pytest: ["pytest.ini", "pyproject.toml"] as const,
  cargo: ["Cargo.toml"] as const,
  gomod: ["go.mod"] as const,
};
