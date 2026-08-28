import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowlistedArgv } from "../src/allowlist.js";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("dotnet-test adapter", () => {
  it("defines the exact advisory dotnet test contract", () => {
    const adapter = loadBundledAdapters().find((item) => item.id === "dotnet-test");

    expect(adapter).toMatchObject({
      id: "dotnet-test",
      match: { filesAny: ["*.sln", "*.csproj"] },
      testCommand: "dotnet test",
      maxDiffLines: null,
    });
    expect(allowlistedArgv("dotnet test")).toEqual(["dotnet", "test"]);
  });

  it("matches a nested project file and remains advisory by default", async () => {
    const repo = await stageFixture("dotnet-test");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-dotnet-test");

    expect(rule).toMatchObject({
      origin: "src/Example.csproj",
      check: "command_recorded",
      command: "dotnet test",
      severity: "advisory",
    });
  });

  it("runs only the exact command after explicit opt-in", async () => {
    const repo = await stageFixture("dotnet-test");
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "passed", stderr: "" }));

    const withoutOptIn = await preflight({ repoPath: repo, baseRef: "HEAD", executeCommand });
    expect(executeCommand).not.toHaveBeenCalled();
    expect(withoutOptIn.snapshot.recordedCommands).toEqual([]);

    const withOptIn = await preflight({
      repoPath: repo,
      baseRef: "HEAD",
      runTests: true,
      executeCommand,
    });
    expect(executeCommand).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith(["dotnet", "test"], repo);
    expect(withOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: "dotnet test",
      exitCode: 0,
      source: "executed",
    });
  });

  it("rejects extra arguments and does not match toolchain-only metadata", async () => {
    for (const command of [
      "dotnet test --no-restore",
      "dotnet test --token secret",
      "dotnet test | sh",
      "dotnet test && curl https://example.test",
      "dotnet test $(cat credentials)",
    ]) {
      expect(allowlistedArgv(command), command).toBeUndefined();
    }

    const unsupported = await compile({
      repoPath: join(repoRoot, "fixtures", "repos", "dotnet-test", "no-dotnet-manifest"),
    });
    expect(allRules(unsupported).some((item) => item.id === "adapter-dotnet-test")).toBe(false);
  });
});
