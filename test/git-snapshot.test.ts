import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { evaluate } from "../src/evaluate.js";
import { preflight } from "../src/preflight.js";
import { buildSnapshot, resolveRef } from "../src/repo.js";
import { compile } from "../src/compile.js";
import { spawnArgv } from "../src/preflight.js";
import { blockRule, emptySnapshot, makeContract, stageFixture } from "./helpers.js";

const execFile = promisify(execFileCallback);

describe("git snapshot reliability", () => {
  it("preserves tabs, newlines and leading spaces in untracked paths", async () => {
    const repo = await stageFixture("pass-clean");
    const names = ["a\tb.txt", "a\nb.txt", " leading.txt"];
    for (const name of names) {
      await writeFile(join(repo, name), "new text\n", "utf8");
    }
    const snapshot = await buildSnapshot(repo, "HEAD");
    for (const name of names) expect(snapshot.changedPaths).toContain(name);
    expect(snapshot.diffStat.files).toBeGreaterThanOrEqual(names.length);
  });

  it("considers both old and new paths of a rename for workflow safety", async () => {
    const repo = await stageFixture("pass-clean");
    await mkdir(join(repo, ".github", "workflows"), { recursive: true });
    const oldPath = ".github/workflows/legacy.yml";
    const newPath = "renamed.yml";
    await writeFile(join(repo, oldPath), "name: Test\non: push\njobs:\n  scan:\n    runs-on: ubuntu-latest\n", "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "baseline"], { cwd: repo });
    await rename(join(repo, oldPath), join(repo, newPath));
    const snapshot = await buildSnapshot(repo, "HEAD");
    expect(snapshot.changedPaths).toContain(oldPath);
    expect(snapshot.changedPaths).toContain(newPath);
    const contract = makeContract([], [], [
      blockRule({
        id: "forbidden-path",
        check: "forbidden_path",
        severity: "needs-human",
        glob: ".github/workflows/**",
        message: "human review required",
      }),
    ]);
    const receipt = evaluate(contract, snapshot);
    expect(receipt.status).toBe("needs-human");
  });

  it("does not read untracked symlink targets when counting diff lines", async () => {
    const repo = await stageFixture("pass-clean");
    await writeFile(join(repo, "local.txt"), "very\nsensitive\nlines\n", "utf8");
    await symlink(join(repo, "local.txt"), join(repo, "link.txt"));
    const snapshot = await buildSnapshot(repo, "HEAD");
    expect(snapshot.changedPaths).toContain("link.txt");
    expect(snapshot.pathDiffs?.find((row) => row.path === "link.txt")?.insertions).toBe(0);
  });

  it("does not follow symlinks while compiling a non-Git fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "ck-untrusted-"));
    const outside = await mkdtemp(join(tmpdir(), "ck-secret-"));
    try {
      await writeFile(join(outside, "private.txt"), "not repository data\n", "utf8");
      await symlink(join(outside, "private.txt"), join(root, "LICENSE"));
      const contract = await compile({ repoPath: root });
      expect(contract.sources.some((source) => source.path === "LICENSE")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("terminates a stuck test process with a distinct timeout code", async () => {
    const repo = await stageFixture("pass-clean");
    const result = await spawnArgv([process.execPath, "-e", "setInterval(() => {}, 1000)"], repo, 100);
    expect(result.exitCode).toBe(124);
  });

  it("refuses to execute any target tests when the target is not a Git root", async () => {
    const root = await mkdtemp(join(tmpdir(), "ck-not-a-repo-"));
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));
    try {
      await writeFile(join(root, "package.json"), '{"scripts":{"test":"echo unsafe"}}');
      await expect(preflight({
        repoPath: root,
        baseRef: "HEAD",
        runTests: true,
        executeCommand,
      })).rejects.toThrow(/not a git repository root/);
      expect(executeCommand).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses git's option separator for user-supplied revisions", async () => {
    const repo = await stageFixture("pass-clean");
    await expect(resolveRef(repo, "--help")).rejects.toThrow(/cannot resolve git ref/);
    expect(await resolveRef(repo, "HEAD")).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("DCO and opt-in test provenance", () => {
  it("requires every contribution commit to have a sign-off", () => {
    const contract = makeContract([
      blockRule({ id: "dco", check: "commit_signed_off", message: "sign off" }),
    ]);
    const signed = "fix: patch\n\nSigned-off-by: Dev <dev@example.com>";
    expect(evaluate(contract, emptySnapshot({ commitMessages: [signed, "fix: unsigned"] })).status).toBe("blocked");
    expect(evaluate(contract, emptySnapshot({ commitMessages: [] })).status).toBe("blocked");
    expect(evaluate(contract, emptySnapshot({ commitMessages: [signed, signed] })).status).toBe("pass");
  });

  it("executes each distinct required adapter command once, not just the first", async () => {
    const repo = await stageFixture("pass-clean");
    await writeFile(join(repo, "Cargo.toml"), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n', "utf8");
    await writeFile(join(repo, "pytest.ini"), "[pytest]\n", "utf8");
    await writeFile(join(repo, "contribkit.yml"), [
      "schema: contribkit.policy.v1",
      "blockAdapters:",
      "  - rust-cargo",
      "  - python-pytest",
      "",
    ].join("\n"), "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "baseline"], { cwd: repo });
    await writeFile(join(repo, "changed.txt"), "edit\n", "utf8");
    const executeCommand = vi.fn(async (argv: readonly string[]) => ({
      exitCode: argv[0] === "cargo" ? 1 : 0,
      stdout: "done",
      stderr: "",
    }));
    const first = await preflight({ repoPath: repo, baseRef: "HEAD", executeCommand });
    expect(executeCommand).not.toHaveBeenCalled();
    expect(first.receipt.status).toBe("blocked");
    const second = await preflight({ repoPath: repo, baseRef: "HEAD", runTests: true, executeCommand });
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(second.snapshot.recordedCommands.map((command) => command.command).sort()).toEqual([
      "cargo test", "pytest -q",
    ]);
    expect(second.receipt.status).toBe("blocked");
    expect(second.receipt.findings.some((f) => f.ruleId === "adapter-rust-cargo" && !f.passed)).toBe(true);
    executeCommand.mockImplementation(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));
    const third = await preflight({ repoPath: repo, baseRef: "HEAD", runTests: true, executeCommand });
    expect(third.receipt.status).toBe("pass");
  });
});
