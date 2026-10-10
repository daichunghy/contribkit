import { currentBranch, git, isGitRepo, RepoError, resolveRef } from "./repo.js";

/** Return configured Git remote names without consulting the network. */
async function configuredRemotes(repoPath: string): Promise<Set<string>> {
  const result = await git(repoPath, ["remote"]);
  if (result.code !== 0) throw new RepoError("cannot inspect Git remotes: " + result.stderr.trim());
  return new Set(result.stdout.split(/\r?\n/).filter((name) => name.length > 0));
}

function requireUnambiguousRemote(names: Set<string>): void {
  if (names.has("origin") && names.has("upstream")) {
    throw new RepoError(
      "This clone has both origin and upstream remotes (likely a fork). " +
      "ContribKit cannot infer which repository will receive your PR. " +
      "Specify --base upstream/main (or the actual target branch) explicitly; " +
      "for Claude hooks, set CONTRIBKIT_BASE_REF=upstream/main."
    );
  }
}

/** Translate a PR target branch into a local remote-tracking ref without assuming forks use origin. */
export async function resolvePrBaseRef(repoPath: string, requestedBranch: string): Promise<string> {
  if (requestedBranch.trim().length === 0) throw new RepoError("pull request target branch is empty");
  if (requestedBranch.startsWith("refs/remotes/") ||
      requestedBranch.startsWith("origin/") || requestedBranch.startsWith("upstream/")) {
    return requestedBranch;
  }
  // Unqualified target branch can refer to either the upstream project or a fork.
  const names = await configuredRemotes(repoPath);
  requireUnambiguousRemote(names);
  return (names.has("upstream") && !names.has("origin") ? "upstream/" : "origin/") + requestedBranch;
}

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
  const remoteNames = await configuredRemotes(repoPath);
  requireUnambiguousRemote(remoteNames);
  const selectedRemote = remoteNames.has("upstream") && !remoteNames.has("origin") ? "upstream" : "origin";
  const candidates = ["HEAD", "main", "master"].map((name) => [
    "refs/remotes/" + selectedRemote + "/" + name,
    selectedRemote + "/" + name,
  ] as const);
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
    ". Fetch your target remote and retry, or choose explicitly: contribkit check --base <trusted-ref>. " +
    "Do not silently use HEAD: it misses existing branch commits."
  );
}
