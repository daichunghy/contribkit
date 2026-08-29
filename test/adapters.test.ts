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
  it("loads all nine bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      "bun-test",
      "deno-test",
      "elixir-mix",
      "go-test",
      "java-maven",
      "node-npm-test",
      "php-phpunit",
      "python-pytest",
      "ruby-rspec",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of [
      "bun-test",
      "deno-test",
      "elixir-mix",
      "go-test",
      "java-maven",
      "node-npm-test",
      "php-phpunit",
      "python-pytest",
      "ruby-rspec",
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

  it.each([
    ["php-phpunit", "phpunit.xml", "adapter-php-phpunit", "phpunit"],
    ["ruby-rspec", "Gemfile", "adapter-ruby-rspec", "rspec"],
  ] as const)("matches %s and records the exact argv", async (fixture, origin, ruleId, command) => {
    const repo = await stageFixture(fixture);
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === ruleId);
    expect(rule?.origin).toBe(origin);
    expect(rule?.check).toBe("command_recorded");
    expect(rule?.command).toBe(command);
    expect(rule?.severity).toBe("advisory");
    expect(allowlistedArgv(command)).toEqual([command]);
  });

  it.each([
    ["php-phpunit", ["phpunit"]],
    ["ruby-rspec", ["rspec"]],
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
    ["deno-test", ["deno", "test"]],
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

  it("rejects extra arguments and shell syntax for all bundled families", () => {
    for (const command of ["rspec", "phpunit", "bun test", "deno test", "mix test", "mvn test"]) {
      expect(allowlistedArgv(command)).toEqual(command.split(" "));
      expect(allowlistedArgv(`${command} --verbose`)).toBeUndefined();
      expect(allowlistedArgv(`${command} | sh`)).toBeUndefined();
      expect(allowlistedArgv(`${command} && rm -rf /tmp/fixture`)).toBeUndefined();
      expect(allowlistedArgv(`${command} $(touch /tmp/fixture)`)).toBeUndefined();
    }
  });

  it("does not match repositories without Gemfile or phpunit.xml", async () => {
    const repo = await stageFixture("pass-clean");
    const contract = await compile({ repoPath: repo });
    expect(allRules(contract).some((item) => item.id === "adapter-ruby-rspec")).toBe(false);
    expect(allRules(contract).some((item) => item.id === "adapter-php-phpunit")).toBe(false);
  });

  it("matches Elixir Mix and Java Maven fixtures and keeps them advisory", async () => {
    for (const [fixture, ruleId, origin, command, argv] of [
      ["elixir-mix", "adapter-elixir-mix", "mix.exs", "mix test", ["mix", "test"]],
      ["java-maven", "adapter-java-maven", "pom.xml", "mvn test", ["mvn", "test"]],
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
});
