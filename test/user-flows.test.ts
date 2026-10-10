import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { stageFixture } from "./helpers.js";

const execFile = promisify(execFileCallback);
async function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    stdout: { write: (chunk: string) => { stdout += chunk; } },
    stderr: { write: (chunk: string) => { stderr += chunk; } },
    env: {},
  });
  return { code, stdout, stderr };
}

describe("first-time CLI workflows", () => {
  it("gives a useful help screen and a convenient check alias", async () => {
    const help = await run([]);
    expect(help.stdout).toMatch(/contribkit doctor/);
    expect(help.stdout).toMatch(/contribkit check/);
    expect((await run(["check", "--help"])).code).toBe(0);
  });

  it("refuses to silently pass a Git clone with no remote tracking base", async () => {
    const repo = await stageFixture("pass-clean");
    const check = await run(["check", "--repo", repo]);
    expect(check.code).toBe(2);
    expect(check.stderr).toMatch(/No trustworthy remote base/);
    const doctor = await run(["doctor", "--repo", repo]);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toMatch(/needs setup/);
    expect(doctor.stdout).toMatch(/--base/);
  });

  it("discovers remote base, reports checks and accepts an explicit PR body", async () => {
    const repo = await stageFixture("missing-issue");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    const diagnostic = await run(["doctor", "--repo", repo, "--json"]);
    expect(diagnostic.code).toBe(0);
    expect(JSON.parse(diagnostic.stdout)).toMatchObject({
      schema: "contribkit.doctor.v1",
      ready: true,
      base: "origin/main",
    });
    const blocked = await run(["check", "--repo", repo]);
    expect(blocked.code).toBe(1);
    expect(blocked.stdout).toContain("next steps:");
    const success = await run(["check", "--repo", repo, "--body", "Fixes #123"]);
    expect(success.code).toBe(0);
    expect(success.stdout).toContain("contribkit pass");
  });

  it("can fail a CI job for human review without breaking legacy exit semantics", async () => {
    const repo = await stageFixture("codeowners-path");
    const legacy = await run(["check", "--repo", repo, "--base", "HEAD"]);
    expect(legacy.code).toBe(0);
    expect(legacy.stdout).toMatch(/needs-human/);
    const strict = await run(["check", "--repo", repo, "--base", "HEAD", "--strict"]);
    expect(strict.code).toBe(3);
    const machine = await run(["check", "--repo", repo, "--base", "HEAD", "--strict", "--json"]);
    expect(machine.code).toBe(3);
    expect(JSON.parse(machine.stdout)).toHaveProperty("status", "needs-human");
  });

  it.each([
    ["check", "--boase", "HEAD"],
    ["check", "--base"],
    ["check", "--body", "hello", "--body-file", "pr.md"],
    ["doctor", "--run-tests"],
    ["check", "--base", "HEAD", "--base", "main"],
  ])("rejects a malformed or confusing option sequence: %j", async (...args) => {
    const result = await run(args);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/unknown option|missing value|choose only one|duplicate option/);
  });

  it("rejects altered receipt contents rather than displaying forged success", async () => {
    const repo = await stageFixture("missing-issue");
    const temp = await mkdtemp(join(tmpdir(), "ck-ux-"));
    const path = join(temp, "receipt.json");
    try {
      const checked = await run(["check", "--repo", repo, "--base", "HEAD", "--out", path]);
      expect(checked.code).toBe(1);
      const intact = await run(["explain", path]);
      expect(intact.code).toBe(0);
      expect(intact.stdout).toContain("contribkit blocked");
      const receipt = JSON.parse(await readFile(path, "utf8")) as { status: string };
      receipt.status = "pass";
      await writeFile(path, JSON.stringify(receipt));
      const altered = await run(["explain", path]);
      expect(altered.code).toBe(2);
      expect(altered.stderr).toMatch(/receipt digest mismatch/);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
