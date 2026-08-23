import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { matchRepoPath } from "../src/glob.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("bundled adapters", () => {
  it("loads bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      "dotnet-test",
      "go-test",
      "node-npm-test",
      "python-pytest",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["dotnet-test", "go-test", "node-npm-test", "python-pytest"]) {
      const golden = JSON.parse(
        readFileSync(join(repoRoot, "adapters", id, "tests", "golden.json"), "utf8"),
      ) as { expectRuleId: string; expectCommand: string; expectSeverity: string };
      const adapter = loadBundledAdapters().find((item) => item.id === id);
      expect(adapter?.testCommand).toBe(golden.expectCommand);
    }
  });

  it("python-pytest fixture adds advisory pytest -q without executing it", async () => {
    const repo = await stageFixture("python-pytest");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-python-pytest");
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe("pytest -q");
    expect(rule?.severity).toBe("advisory");
    expect(allRules(contract).some((item) => item.id === "adapter-node-npm-test")).toBe(false);
  });

  it("dotnet-test matches project globs and adds an advisory exact command", async () => {
    const repo = await stageFixture("dotnet-test");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-dotnet-test");
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe("dotnet test");
    expect(rule?.severity).toBe("advisory");
    expect(matchRepoPath("*.csproj", "src/App.csproj")).toBe(true);
    expect(matchRepoPath("*.fsproj", "src/App.fsproj")).toBe(true);
    expect(matchRepoPath("*.sln", "solutions/App.sln")).toBe(true);
    expect(matchRepoPath("*.csproj", "src/App.fsproj")).toBe(false);
  });

  it("only executes dotnet test with runTests and records the exact argv", async () => {
    const repo = await stageFixture("dotnet-test");
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "passed", stderr: "" }));
    const withoutOptIn = await preflight({
      repoPath: repo,
      baseRef: "HEAD",
      executeCommand,
    });
    expect(executeCommand).not.toHaveBeenCalled();
    expect(withoutOptIn.snapshot.recordedCommands).toEqual([]);

    const withOptIn = await preflight({
      repoPath: repo,
      baseRef: "HEAD",
      runTests: true,
      executeCommand,
    });
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(["dotnet", "test"], repo);
    expect(withOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: "dotnet test",
      exitCode: 0,
      source: "executed",
    });
  });
});
