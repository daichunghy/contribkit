import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("bundled adapters", () => {
  it("loads bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      "go-test",
      "node-npm-test",
      "python-pytest",
      "swift-test",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["go-test", "node-npm-test", "python-pytest", "swift-test"]) {
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

  it("swift-test fixture records the exact allowlisted command and runs it only when opted in", async () => {
    const repo = await stageFixture("swift-test");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-swift-test");
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe("swift test");
    expect(rule?.severity).toBe("advisory");

    let invoked: readonly string[] | undefined;
    const { receipt } = await preflight({
      repoPath: repo,
      baseRef: "HEAD",
      runTests: true,
      executeCommand: async (argv) => {
        invoked = [...argv];
        return { exitCode: 0, stdout: "swift test fixture", stderr: "" };
      },
    });
    expect(invoked).toEqual(["swift", "test"]);
    expect(receipt.findings.some((item) => item.ruleId === "adapter-swift-test" && item.passed)).toBe(true);
  });
});
