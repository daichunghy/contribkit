import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowlistedArgv } from "../src/allowlist.js";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("bundled adapters", () => {
  it("loads bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual(["cmake-ctest", "go-test", "node-npm-test", "python-pytest"]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["cmake-ctest", "go-test", "node-npm-test", "python-pytest"]) {
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

  it("cmake-ctest matches CMakeLists.txt and records the exact argv", async () => {
    const repo = await stageFixture("cmake-ctest");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-cmake-ctest");
    expect(rule?.origin).toBe("CMakeLists.txt");
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe("ctest --output-on-failure");
    expect(rule?.severity).toBe("advisory");
    expect(allowlistedArgv("ctest --output-on-failure")).toEqual(["ctest", "--output-on-failure"]);
    expect(allowlistedArgv("ctest")).toBeUndefined();
  });

  it("does not execute cmake-ctest without --run-tests, then executes only the exact argv", async () => {
    const repo = await stageFixture("cmake-ctest");
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));

    await preflight({ repoPath: repo, baseRef: "HEAD", executeCommand });
    expect(executeCommand).not.toHaveBeenCalled();

    await preflight({ repoPath: repo, baseRef: "HEAD", runTests: true, executeCommand });
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(["ctest", "--output-on-failure"], repo);
  });

  it("does not match repositories without CMakeLists.txt", async () => {
    const repo = await stageFixture("pass-clean");
    const contract = await compile({ repoPath: repo });
    expect(allRules(contract).some((item) => item.id === "adapter-cmake-ctest")).toBe(false);
  });
});
