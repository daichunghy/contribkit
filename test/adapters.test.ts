import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowlistedArgv, inferTestCommand } from "../src/allowlist.js";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("bundled adapters", () => {
  it("loads all eleven bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      "bun-test",
      "cmake-ctest",
      "deno-test",
      "dotnet-test",
      "elixir-mix",
      "go-test",
      "java-maven",
      "node-npm-test",
      "python-pytest",
      "rust-cargo",
      "swift-test",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of [
      "bun-test",
      "cmake-ctest",
      "deno-test",
      "dotnet-test",
      "elixir-mix",
      "go-test",
      "java-maven",
      "node-npm-test",
      "python-pytest",
      "rust-cargo",
      "swift-test",
    ]) {
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
    for (const [fixture, origin] of [
      ["bun-lock", "bun.lock"],
      ["bun-lockb", "bun.lockb"],
      ["bun-package-manager", "package.json"],
    ] as const) {
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

  it.each([
    ["bun-lock-package-script", "bun.lock"],
    ["bun-lockb-package-script", "bun.lockb"],
  ] as const)("gives %s Bun marker priority over npm fallback", async (fixture, origin) => {
    const repo = await stageFixture(fixture);
    const contract = await compile({ repoPath: repo });
    const rules = allRules(contract);
    const testRule = rules.find((item) => item.id === "test-command");
    expect(testRule?.command).toBe("bun test");
    expect(testRule?.severity).toBe("block");
    expect(rules.some((item) => item.id === "test-command" && item.command === "npm test")).toBe(false);
    expect(rules.some((item) => item.id === "adapter-bun-test" && item.origin === origin)).toBe(false);
    expect(rules.some((item) => item.id === "adapter-node-npm-test")).toBe(false);
  });

  it("does not treat a Bun test script as a Bun marker without packageManager or lockfile", async () => {
    const repo = await stageFixture("bun-script-without-marker");
    const contract = await compile({ repoPath: repo });
    const rules = allRules(contract);
    expect(rules.find((item) => item.id === "test-command")?.command).toBe("npm test");
    expect(rules.some((item) => item.id === "adapter-bun-test")).toBe(false);
  });

  it("infers bun test from a Bun packageManager test script", async () => {
    const repo = await stageFixture("bun-package-manager-script");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "test-command");
    expect(rule?.command).toBe("bun test");
    expect(allRules(contract).some((item) => item.id === "adapter-bun-test")).toBe(false);
    expect(allRules(contract).some((item) => item.id === "adapter-node-npm-test")).toBe(false);
  });

  it.each([
    ["cmake-ctest", ["ctest"]],
    ["deno-test", ["deno", "test"]],
    ["swift-test", ["swift", "test"]],
    ["bun-lock", ["bun", "test"]],
    ["elixir-mix", ["mix", "test"]],
    ["java-maven", ["mvn", "test"]],
  ] as const)("only executes %s after --run-tests opt-in", async (fixture, argv) => {
    const repo = await stageFixture(fixture);
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
    expect(executeCommand).toHaveBeenCalledWith(argv, repo);
    expect(withOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: argv.join(" "),
      exitCode: 0,
      source: "executed",
    });
  });

  it("rejects extra arguments and shell syntax for all added families", () => {
    for (const command of ["ctest", "bun test", "deno test", "swift test", "mix test", "mvn test"]) {
      expect(allowlistedArgv(command)).toEqual(command.split(" "));
      expect(allowlistedArgv(`${command} --verbose`)).toBeUndefined();
      expect(allowlistedArgv(`${command} | sh`)).toBeUndefined();
      expect(allowlistedArgv(`${command} && rm -rf /tmp/fixture`)).toBeUndefined();
      expect(allowlistedArgv(`${command} $(touch /tmp/fixture)`)).toBeUndefined();
    }
  });

  it("matches Elixir Mix and Java Maven fixtures and keeps them advisory", async () => {
    for (const [fixture, ruleId, origin, command, argv] of [
      ["elixir-mix", "adapter-elixir-mix", "mix.exs", "mix test", ["mix", "test"]],
      ["java-maven", "adapter-java-maven", "pom.xml", "mvn test", ["mvn", "test"]],
      ["swift-test", "adapter-swift-test", "Package.swift", "swift test", ["swift", "test"]],
    ] as const) {
      const repo = await stageFixture(fixture);
      const contract = await compile({ repoPath: repo });
      const rule = allRules(contract).find((item) => item.id === ruleId);
      expect(rule?.origin).toBe(origin);
      expect(rule?.check).toBe("command_recorded");
      expect(rule?.command).toBe(command);
      expect(rule?.severity).toBe("advisory");
      expect(allowlistedArgv(command)).toEqual(argv);
    }
  });

  it("does not match repositories without mix.exs or pom.xml", async () => {
    const repo = await stageFixture("pass-clean");
    const contract = await compile({ repoPath: repo });
    expect(allRules(contract).some((item) => item.id === "adapter-elixir-mix")).toBe(false);
    expect(allRules(contract).some((item) => item.id === "adapter-java-maven")).toBe(false);
  });

  it("matches a real CMake/CTest manifest and keeps the exact executable advisory", async () => {
    const adapter = loadBundledAdapters().find((item) => item.id === "cmake-ctest");
    expect(adapter).toMatchObject({
      id: "cmake-ctest",
      match: { filesAny: ["CMakeLists.txt"] },
      testCommand: "ctest",
      maxDiffLines: null,
    });

    const repo = await stageFixture("cmake-ctest");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-cmake-ctest");
    expect(rule).toMatchObject({
      origin: "CMakeLists.txt",
      check: "command_recorded",
      command: "ctest",
      severity: "advisory",
    });
    expect(allowlistedArgv("ctest")).toEqual(["ctest"]);
    expect(allowlistedArgv("ctest --output-on-failure")).toBeUndefined();
    expect(inferTestCommand({ mentionsCtest: true })).toBe("ctest");
  });

  it("runs CTest only after explicit opt-in and passes no shell arguments", async () => {
    const repo = await stageFixture("cmake-ctest");
    const executeCommand = vi.fn(async () => ({ exitCode: 0, stdout: "passed", stderr: "" }));

    await preflight({ repoPath: repo, baseRef: "HEAD", executeCommand });
    expect(executeCommand).not.toHaveBeenCalled();

    await preflight({ repoPath: repo, baseRef: "HEAD", runTests: true, executeCommand });
    expect(executeCommand).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith(["ctest"], repo);
  });

  it("rejects missing and invalid CMake manifests", async () => {
    for (const name of ["no-cmake-manifest", "invalid-cmake-manifest"] as const) {
      const repo = join(repoRoot, "fixtures", "repos", "cmake-ctest", name);
      const contract = await compile({ repoPath: repo });
      expect(allRules(contract).some((item) => item.id === "adapter-cmake-ctest")).toBe(false);
    }
  });
});
