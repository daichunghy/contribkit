import { execFile as execFileCallback } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { classifyHookInput, remoteBaseRef } from "../src/hook-input.js";
import { handleHookEvent } from "../src/hook.js";
import { stageFixture } from "./helpers.js";

const execFile = promisify(execFileCallback);

describe("Claude PreToolUse PR detection", () => {
  it("ignores non-PR shell commands, including mentioning PR syntax in a quote", () => {
    expect(classifyHookInput({ tool_name: "Bash", tool_input: { command: "npm test" } })).toEqual({ action: "ignore" });
    expect(classifyHookInput({ tool_name: "Bash", tool_input: { command: "git push origin main" } })).toEqual({ action: "ignore" });
    expect(classifyHookInput({ tool_name: "Bash", tool_input: { command: "echo 'gh pr create --body test'" } })).toEqual({ action: "ignore" });
    expect(classifyHookInput({ tool_name: "Read", tool_input: {} })).toEqual({ action: "ignore" });
  });

  it("detects both CLI vendors and captures quoted body and branch without shell evaluation", () => {
    expect(classifyHookInput({
      tool_name: "Bash",
      tool_input: { command: 'cd project && gh pr create --body "Fixes #12" --base develop' },
    })).toMatchObject({ action: "guard", body: "Fixes #12", requestedBase: "develop" });
    expect(classifyHookInput({
      tool_name: "PowerShell",
      tool_input: { command: "glab mr create --description-file 'my draft.md'" },
    })).toMatchObject({ action: "guard", bodyFile: "my draft.md" });
    expect(classifyHookInput({
      tool_name: "Bash",
      tool_input: { command: "gh pr create --body=$(echo risky)" },
    }).action).toBe("guard");
    expect(classifyHookInput({
      tool_name: "PowerShell",
      tool_input: { command: "C:\\tools\\gh.exe pr create --body 'Fixes #8'" },
    })).toMatchObject({ action: "guard", body: "Fixes #8" });
    expect(remoteBaseRef("main")).toBe("origin/main");
    expect(classifyHookInput({
      tool_name: "Bash",
      tool_input: { command: 'glab mr create -d "Fixes #32" -b release' },
    })).toMatchObject({ action: "guard", body: "Fixes #32", requestedBase: "release" });
    expect(classifyHookInput({
      tool_name: "Bash",
      tool_input: { command: 'gh pr create -b "Fixes #42" -B develop' },
    })).toMatchObject({ action: "guard", body: "Fixes #42", requestedBase: "develop" });
  });

  it("recognizes MCP create PR calls but does not intercept other MCP tools", () => {
    expect(classifyHookInput({
      tool_name: "mcp__github__create_pull_request",
      tool_input: { body: "Fixes #5", base_branch: "main" },
    })).toMatchObject({ action: "guard", body: "Fixes #5", requestedBase: "main" });
    expect(classifyHookInput({
      tool_name: "mcp__github__search_pull_requests",
      tool_input: {},
    })).toEqual({ action: "ignore" });
  });

  it("does not block ordinary work even when repo has failing policies", async () => {
    const repo = await stageFixture("missing-issue");
    const denial = await handleHookEvent({
      cwd: repo,
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    }, { cwd: repo, env: {} });
    expect(denial).toBeUndefined();
  });

  it("passes a real PR body into the contract and denies when it is missing", async () => {
    const repo = await stageFixture("missing-issue");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    const base = { cwd: repo, tool_name: "mcp__github__create_pull_request" };
    const denied = await handleHookEvent({
      ...base,
      tool_input: { body: "Changed something", base_branch: "main" },
    }, { cwd: repo, env: {} });
    expect(denied).toMatch(/issue-link/);
    const allowed = await handleHookEvent({
      ...base,
      tool_input: { body: "Fixes #123", base_branch: "main" },
    }, { cwd: repo, env: {} });
    expect(allowed).toBeUndefined();
  });

  it("reads gh --body-file relative to the declared cwd, without executing shell text", async () => {
    const repo = await stageFixture("missing-issue");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    await writeFile(join(repo, "pr.md"), "Fixes #123\n", "utf8");
    const decision = await handleHookEvent({
      cwd: repo, tool_name: "Bash", tool_input: { command: "gh pr create --body-file pr.md --base main" },
    }, { cwd: repo, env: {} });
    // The PR body file itself is untracked, and still counts as a local diff.
    expect(decision).toBeUndefined();
  });
  it("requires an explicit upstream base for fork PR hooks", async () => {
    const repo = await stageFixture("missing-issue");
    const sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFile("git", ["remote", "add", "origin", "https://example.invalid/fork"], { cwd: repo });
    await execFile("git", ["remote", "add", "upstream", "https://example.invalid/source"], { cwd: repo });
    for (const remote of ["origin", "upstream"]) {
      await execFile("git", ["update-ref", "refs/remotes/" + remote + "/main", sha], { cwd: repo });
    }
    const event = {
      cwd: repo,
      tool_name: "mcp__github__create_pull_request",
      tool_input: { base_branch: "main", body: "Fixes #9" },
    };
    expect(await handleHookEvent(event, { cwd: repo, env: {} })).toMatch(/both origin and upstream/);
    expect(await handleHookEvent(event, {
      cwd: repo, env: { CONTRIBKIT_BASE_REF: "upstream/main" },
    })).toBeUndefined();
  });

});
