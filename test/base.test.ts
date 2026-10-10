import { execFile as execFileCallback } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { resolveTrustedBase } from "../src/base.js";
import { stageFixture } from "./helpers.js";

const execFile = promisify(execFileCallback);

describe("trusted base discovery", () => {
  it("does not silently use HEAD when no remote tracking branch exists", async () => {
    const repo = await stageFixture("pass-clean");
    await expect(resolveTrustedBase(repo)).rejects.toThrow(/No trustworthy remote base/);
    const explicit = await resolveTrustedBase(repo, "HEAD");
    expect(explicit.ref).toBe("HEAD");
    expect(explicit.source).toBe("explicit");
    expect(explicit.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("prefers origin/HEAD over a conventional origin/main when default branch differs", async () => {
    const repo = await stageFixture("pass-clean");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["update-ref", "refs/remotes/origin/develop", sha], { cwd: repo });
    await execFile("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    await execFile("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"], { cwd: repo });
    const picked = await resolveTrustedBase(repo);
    expect(picked.ref).toBe("origin/HEAD");
    expect(picked.sha).toBe(sha);
    expect(picked.source).toBe("remote");
  });

  it("auto-discovers origin/main without origin/HEAD and compares committed changes", async () => {
    const repo = await stageFixture("pass-clean");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    await writeFile(join(repo, "new.txt"), "a new change\n", "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "local work"], { cwd: repo });
    const picked = await resolveTrustedBase(repo);
    expect(picked.ref).toBe("origin/main");
    expect(picked.sha).toBe(sha);
  });

  it("rejects invalid bases without falling back to another ref", async () => {
    const repo = await stageFixture("pass-clean");
    await expect(resolveTrustedBase(repo, "not-a-real-branch")).rejects.toThrow(/cannot resolve git ref/);
  });
});
