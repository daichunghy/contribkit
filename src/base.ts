import { currentBranch, git, isGitRepo, RepoError, resolveRef } from "./repo.js";

export interface TrustedBase {
  ref: string;
  sha: string;
  source: "explicit" | "remote";
}

/**
 * Choose a review baseline without silently using the contributor's HEAD.
 * Remote-tracking refs are local snapshots: callers should fetch to refresh
 * them. An explicit --base remains the only safe offline fallback.
 */
export async function resolveTrustedBase(repoPath: string, requested?: string): Promise<TrustedBase> {
  if (!(await isGitRepo(repoPath))) {
    throw new RepoError("not a Git repository root: " + repoPath + ". Run from the clone root or pass --repo.");
  }
  if (requested !== undefined) {
    if (requested.trim().length === 0) throw new RepoError("--base must not be empty");
    return { ref: requested, sha: await resolveRef(repoPath, requested), source: "explicit" };
  }
  const candidates = [
    ["refs/remotes/origin/HEAD", "origin/HEAD"],
    ["refs/remotes/origin/main", "origin/main"],
    ["refs/remotes/origin/master", "origin/master"],
  ] as const;
  for (const [gitRef, label] of candidates) {
    const exists = await git(repoPath, ["show-ref", "--verify", "--quiet", gitRef]);
    if (exists.code !== 0) continue;
    try {
      return { ref: label, sha: await resolveRef(repoPath, gitRef), source: "remote" };
    } catch {
      // A dangling remote-tracking reference must not become a valid base.
    }
  }
  const branch = await currentBranch(repoPath);
  throw new RepoError(
    "No trustworthy remote base found" + (branch ? " on branch " + branch : "") +
    ". Fetch origin and retry, or choose explicitly: contribkit check --base <trusted-ref>. " +
    "Do not silently use HEAD: it misses existing branch commits."
  );
}
