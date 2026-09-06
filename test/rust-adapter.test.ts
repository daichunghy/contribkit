import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allowlistedArgv } from "../src/allowlist.js";
import { loadBundledAdapters } from "../src/adapters.js";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { allRules } from "../src/types.js";
import { repoRoot, stageFixture } from "./helpers.js";

describe("rust-cargo adapter", () => {
  it("defines the exact advisory cargo test contract", () => {
    const adapter = loadBundledAdapters().find((item) => item.id === "rust-cargo");

    expect(adapter).toMatchObject({
      id: "rust-cargo",
      match: { filesAny: ["Cargo.toml"] },
      testCommand: "cargo test",
      maxDiffLines: null,
    });
    expect(allowlistedArgv("cargo test")).toEqual(["cargo", "test"]);
  });

  it("matches a real Cargo fixture and remains advisory by default", async () => {
    const repo = await stageFixture("rust-cargo");
    const contract = await compile({ repoPath: repo });
    const rule = allRules(contract).find((item) => item.id === "adapter-rust-cargo");

    expect(rule).toMatchObject({
      origin: "Cargo.toml",
      check: "command_recorded",
      command: "cargo test",
      severity: "advisory",
    });
  });

  it("runs only the exact command after explicit opt-in", async () => {
    const repo = await stageFixture("rust-cargo");
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
    expect(executeCommand).toHaveBeenCalledWith(["cargo", "test"], repo);
    expect(withOptIn.snapshot.recordedCommands[0]).toMatchObject({
      command: "cargo test",
      exitCode: 0,
      source: "executed",
    });
  });

  it("rejects unsupported Cargo arguments and does not match a toolchain-only fixture", async () => {
    for (const command of [
      "cargo test --all",
      "cargo test --offline",
      "cargo test --token secret",
      "cargo test | sh",
      "cargo test && curl https://example.test",
      "cargo test $(cat credentials)",
    ]) {
      expect(allowlistedArgv(command), command).toBeUndefined();
    }

    const unsupported = await compile({
      repoPath: join(repoRoot, "fixtures", "repos", "rust-cargo", "no-cargo-manifest"),
    });
    expect(allRules(unsupported).some((item) => item.id === "adapter-rust-cargo")).toBe(false);
  });
});
