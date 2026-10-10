import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { parseCodeowners } from "../src/codeowners.js";
import { evaluate } from "../src/evaluate.js";
import { preflight } from "../src/preflight.js";
import { blockRule, emptySnapshot, makeContract, stageFixture } from "./helpers.js";

const execFile = promisify(execFileCallback);

describe("trusted base contract", () => {
  it("does not allow a change to weaken its own preflight policy", async () => {
    const repo = await stageFixture("pass-clean");
    await writeFile(join(repo, "contribkit.yml"), [
      "schema: contribkit.policy.v1",
      "requireIssue: true",
      "maxFiles: 10",
      "",
    ].join("\n"), "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "base policy"], { cwd: repo });
    const baseSha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

    // Simulates the same contributor modifying policy to bypass issue linkage.
    await writeFile(join(repo, "contribkit.yml"), [
      "schema: contribkit.policy.v1",
      "requireIssue: false",
      "maxFiles: 10",
      "",
    ].join("\n"), "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "weaken requirements"], { cwd: repo });
    const { contract, receipt } = await preflight({ repoPath: repo, baseRef: baseSha });
    expect(contract.ref).toBe(baseSha);
    expect(receipt.status).toBe("blocked");
    expect(receipt.findings.some((f) => f.ruleId === "issue-link" && !f.passed)).toBe(true);
  });

  it("surfaces mistyped blockAdapters identifiers instead of ignoring them", async () => {
    const repo = await stageFixture("pass-clean");
    await writeFile(join(repo, "contribkit.yml"), [
      "schema: contribkit.policy.v1",
      "blockAdapters:",
      "  - rust-cargo-typo",
      "",
    ].join("\n"), "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "policy with typo"], { cwd: repo });
    const contract = await compile({ repoPath: repo });
    expect(contract.needsHuman.some((rule) => rule.id === "policy-unknown-adapters")).toBe(true);
  });
});

describe("CODEOWNERS compatibility", () => {
  it("respects ordered ownerless overrides rather than requiring phantom approval", async () => {
    const repo = await stageFixture("pass-clean");
    await mkdir(join(repo, ".github"), { recursive: true });
    await writeFile(join(repo, ".github", "CODEOWNERS"), [
      "* @maintainer",
      "/docs/",
      "/docs/security/ @security",
      "",
    ].join("\n"), "utf8");
    await execFile("git", ["add", "-A"], { cwd: repo });
    await execFile("git", ["commit", "-m", "ownership"], { cwd: repo });
    const contract = await compile({ repoPath: repo });
    const rule = contract.needsHuman.find((item) => item.id === "codeowners");
    expect(rule?.codeownerRules).toHaveLength(3);

    const onlyDocs = emptySnapshot({ changedPaths: ["docs/guide.md"] });
    const onlySource = emptySnapshot({ changedPaths: ["src/main.ts"] });
    const securityDocs = emptySnapshot({ changedPaths: ["docs/security/model.md"] });
    expect(evaluate(contract, onlyDocs).findings.find((f) => f.ruleId === "codeowners")?.passed).toBe(true);
    expect(evaluate(contract, onlySource).findings.find((f) => f.ruleId === "codeowners")?.passed).toBe(false);
    expect(evaluate(contract, securityDocs).findings.find((f) => f.ruleId === "codeowners")?.passed).toBe(false);
  });

  it("preserves legacy path_owned contracts and ignores invalid CODEOWNERS patterns", () => {
    const older = makeContract([], [], [
      blockRule({
        id: "codeowners",
        check: "path_owned",
        severity: "needs-human",
        patterns: ["src/**"],
        message: "human review",
      }),
    ]);
    expect(evaluate(older, emptySnapshot()).status).toBe("needs-human");
    const parsed = parseCodeowners("*.js @owner\n!*.js @other\n[ab].ts @other\n/docs/\n");
    expect(parsed.map((row) => row.pattern)).toEqual(["*.js", "/docs/"]);
    expect(parsed[1]?.owners).toEqual([]);
  });
});
