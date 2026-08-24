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
  it("loads all five bundled adapters sorted by id", () => {
    const adapters = loadBundledAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      "go-test",
      "node-npm-test",
      "php-phpunit",
      "python-pytest",
      "ruby-rspec",
    ]);
  });

  it("matches golden.json command families", () => {
    for (const id of ["go-test", "node-npm-test", "php-phpunit", "python-pytest", "ruby-rspec"]) {
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

  it("rejects extra arguments and shell syntax for Ruby and PHP families", () => {
    for (const command of ["rspec", "phpunit"]) {
      expect(allowlistedArgv(command)).toEqual([command]);
      expect(allowlistedArgv(`${command} --format documentation`)).toBeUndefined();
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
});
