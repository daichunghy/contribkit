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
      "elixir-mix",
      "go-test",
      "java-maven",
      "node-npm-test",
      "python-pytest",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["elixir-mix", "go-test", "java-maven", "node-npm-test", "python-pytest"]) {
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

  it.each([
    ["elixir-mix", "adapter-elixir-mix", "mix.exs", "mix test", ["mix", "test"]],
    ["java-maven", "adapter-java-maven", "pom.xml", "mvn test", ["mvn", "test"]],
  ] as const)("matches %s and records the exact argv", async (fixture, ruleId, origin, command, argv) => {
    const repo = await stageFixture(fixture);
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === ruleId);
    expect(rule?.origin).toBe(origin);
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe(command);
    expect(rule?.severity).toBe("advisory");
    expect(allowlistedArgv(command)).toEqual(argv);
    expect(allowlistedArgv(`${command} --verbose`)).toBeUndefined();
    expect(allowlistedArgv(`${command} | sh`)).toBeUndefined();
    expect(allowlistedArgv(`${command} && rm -rf /tmp/fixture`)).toBeUndefined();
    expect(allowlistedArgv(`${command} $(touch /tmp/fixture)`)).toBeUndefined();
  });

  it.each([
    ["elixir-mix", ["mix", "test"]],
    ["java-maven", ["mvn", "test"]],
  ] as const)("only executes %s with --run-tests", async (fixture, argv) => {
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
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(argv, repo);
    expect(withOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: argv.join(" "),
      exitCode: 0,
      source: "executed",
    });
  });

  it("does not match repositories without mix.exs or pom.xml", async () => {
    const repo = await stageFixture("pass-clean");
    const contract = await compile({ repoPath: repo });
    expect(allRules(contract).some((item) => item.id === "adapter-elixir-mix")).toBe(false);
    expect(allRules(contract).some((item) => item.id === "adapter-java-maven")).toBe(false);
  });
});
