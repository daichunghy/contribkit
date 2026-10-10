import { execFile as execFileCallback } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { compareTextUnit } from "./canonical.js";
import { matchRepoPath } from "./glob.js";
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
  // Separate user-supplied revisions from options and resolve to a commit.
  const result = await git(repoPath, ["rev-parse", "--verify", "--end-of-options", ref + "^{commit}"]);
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
  try {
    // A non-Git fixture must not dereference a symlink outside its root.
    const info = await lstat(abs);
    if (!info.isFile()) return undefined;
    const buf = await readFile(abs);
    return buf.subarray(0, TEXT_CAP).toString("utf8");
  } catch {
    return undefined;
  }
}

async function workingTreeFiles(repoPath: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(relative: string): Promise<void> {
    const absolute = join(repoPath, relative);
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const child = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        files.push(child);
      }
    }
  }
  await visit("");
  files.sort(compareTextUnit);
  return files;
}

async function repositoryFiles(repoPath: string, ref: string): Promise<string[]> {
  if (!(await isGitRepo(repoPath))) return await workingTreeFiles(repoPath);
  const listed = await git(repoPath, ["ls-tree", "-r", "-z", "--name-only", ref]);
  if (listed.code !== 0) return [];
  return listed.stdout
    .split("\0")
    .filter((path) => path.length > 0)
    .sort(compareTextUnit);
}

export async function firstExisting(
  repoPath: string,
  ref: string,
  candidates: readonly string[],
): Promise<{ path: string; text: string } | undefined> {
  let files: string[] | undefined;
  for (const path of candidates) {
    if (/[?*]/.test(path)) {
      files ??= await repositoryFiles(repoPath, ref);
      for (const matched of files) {
        if (!matchRepoPath(path, matched)) continue;
        const text = await readAtRef(repoPath, ref, matched);
        if (text !== undefined) return { path: matched, text };
      }
      continue;
    }
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
  const listed = await git(repoPath, ["ls-files", "-o", "-z", "--exclude-standard"]);
  if (listed.code !== 0) return [];
  // -z retains literal tabs, newlines, leading spaces and backslashes.
  return listed.stdout.split("\0").filter((name) => name.length > 0);
}

/**
 * git diff --numstat -z output. A rename uses an empty path field followed
 * by old-path\0new-path\0. Account for both ends of a rename: moving a file
 * out of a protected path still affects that protected path.
 */
function parseNumstat(stdout: string): PathDiff[] {
  const diffs: PathDiff[] = [];
  const entries = stdout.split("\0");
  let index = 0;
  while (index < entries.length) {
    const header = entries[index++];
    if (!header) continue;
    const first = header.indexOf("\t");
    const second = first < 0 ? -1 : header.indexOf("\t", first + 1);
    if (first < 0 || second < 0) continue;
    const insRaw = header.slice(0, first);
    const delRaw = header.slice(first + 1, second);
    let path = header.slice(second + 1);
    if (path.length === 0) {
      const oldPath = entries[index++];
      const newPath = entries[index++];
      if (!oldPath || !newPath) continue;
      diffs.push({ path: oldPath, insertions: 0, deletions: 0 });
      path = newPath;
    }
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
  const range = await git(repoPath, ["log", "--format=%B%x1f", baseRef + "..HEAD"]);
  const messages: string[] = [];
  if (range.code === 0 && range.stdout.trim().length > 0) {
    for (const part of range.stdout.split("\x1f")) {
      const text = part.trim();
      if (text.length > 0) messages.push(text);
    }
  }
  // No commits since base means no DCO proof; do not borrow the base commit.
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
  const baseSha = await resolveRef(abs, baseRef);

  const numstat = await git(abs, ["diff", "--numstat", "-z", "--no-ext-diff", baseSha, "--"]);
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
      const file = join(abs, path);
      // Git tracks links as paths; do not read the link's target for stats.
      if ((await lstat(file)).isFile()) {
        const buf = await readFile(file);
        if (!buf.includes(0)) {
          insertions = countLines(buf.subarray(0, TEXT_CAP).toString("utf8"));
        }
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
  const messages = await commitMessagesSince(abs, baseSha);

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
