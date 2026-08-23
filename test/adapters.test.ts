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
    expect(adapters.map((item) => item.id)).toEqual([
      "bun-test",
      "deno-test",
      "go-test",
      "node-npm-test",
      "python-pytest",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["bun-test", "deno-test", "go-test", "node-npm-test", "python-pytest"]) {
      const golden = JSON.parse(
        readFileSync(join(repoRoot, "adapters", id, "tests", "golden.json"), "utf8"),
      ) as { expectRuleId: string; expectCommand: string; expectSeverity: string };
      const adapter = loadBundledAdapters().find((item) => item.id === id);
      expect(adapter?.id).toBe(golden.expectRuleId.slice("adapter-".length));
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

  it("deno-test matches both Deno project marker forms", async () => {
    for (const [fixture, origin] of [["deno-test", "deno.json"], ["deno-jsonc", "deno.jsonc"]] as const) {
      const repo = await stageFixture(fixture);
      const contract = await compile({ repoPath: repo });
      const rule = allRules(contract).find((item) => item.id === "adapter-deno-test");
      expect(rule?.origin).toBe(origin);
      expect(rule?.check).toBe("command_recorded");
      expect(rule?.command).toBe("deno test");
      expect(rule?.severity).toBe("advisory");
    }
  });

  it("bun-test matches lockfiles and Bun packageManager without matching npm", async () => {
    for (const [fixture, origin] of [["bun-lock", "bun.lock"], ["bun-lockb", "bun.lockb"], ["bun-package-manager", "package.json"]] as const) {
      const repo = await stageFixture(fixture);
      const contract = await compile({ repoPath: repo });
      const rule = allRules(contract).find((item) => item.id === "adapter-bun-test");
      expect(rule?.origin).toBe(origin);
      expect(rule?.command).toBe("bun test");
      expect(rule?.severity).toBe("advisory");
      expect(allRules(contract).some((item) => item.id === "adapter-node-npm-test")).toBe(false);
    }

    const nonBun = await stageFixture("bun-package-manager-negative");
    const nonBunContract = await compile({ repoPath: nonBun });
    expect(allRules(nonBunContract).some((item) => item.id === "adapter-bun-test")).toBe(false);
  });

  it("infers bun test from a Bun packageManager test script", async () => {
    const repo = await stageFixture("bun-package-manager-script");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "test-command");
    expect(rule?.command).toBe("bun test");
    expect(allRules(contract).some((item) => item.id === "adapter-bun-test")).toBe(false);
    expect(allRules(contract).some((item) => item.id === "adapter-node-npm-test")).toBe(false);
  });

  it("runs Deno and Bun only after opt-in and with exact argv", async () => {
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "passed", stderr: "" }));
    const denoRepo = await stageFixture("deno-test");
    const denoWithoutOptIn = await preflight({ repoPath: denoRepo, baseRef: "HEAD", executeCommand });
    expect(denoWithoutOptIn.snapshot.recordedCommands).toEqual([]);
    expect(executeCommand).not.toHaveBeenCalled();
    const denoWithOptIn = await preflight({
      repoPath: denoRepo,
      baseRef: "HEAD",
      runTests: true,
      executeCommand,
    });
    expect(executeCommand).toHaveBeenLastCalledWith(["deno", "test"], denoRepo);
    expect(denoWithOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: "deno test",
      exitCode: 0,
      source: "executed",
    });

    const bunRepo = await stageFixture("bun-lock");
    await preflight({ repoPath: bunRepo, baseRef: "HEAD", runTests: true, executeCommand });
    expect(executeCommand).toHaveBeenLastCalledWith(["bun", "test"], bunRepo);
  });

  it("rejects extra arguments and shell syntax for the new families", () => {
    expect(allowlistedArgv("deno test")).toEqual(["deno", "test"]);
    expect(allowlistedArgv("bun test")).toEqual(["bun", "test"]);
    expect(allowlistedArgv("deno test --allow-net")).toBeUndefined();
    expect(allowlistedArgv("bun test --watch")).toBeUndefined();
    expect(allowlistedArgv("deno test | sh")).toBeUndefined();
    expect(allowlistedArgv("bun test && rm -rf /tmp")).toBeUndefined();
    expect(allowlistedArgv("bun test $(whoami)")).toBeUndefined();
  });
});
