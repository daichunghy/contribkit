import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { preflight } from "../src/preflight.js";
import { assertContract, assertReceipt } from "../src/schema.js";
import { runCli } from "../src/cli.js";
import { canonicalJson } from "../src/canonical.js";
import { receiptBodyOf } from "../src/evaluate.js";
import { repoRoot, stageFixture } from "./helpers.js";

async function captureCli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    stdout: { write: (chunk: string) => { stdout += chunk; } },
    stderr: { write: (chunk: string) => { stderr += chunk; } },
    env: {},
  });
  return { code, stdout, stderr };
}

describe("golden fixtures", () => {
  it("missing-issue preflight is blocked on issue-link", async () => {
    const repo = await stageFixture("missing-issue");
    const { receipt } = await preflight({ repoPath: repo, baseRef: "HEAD" });
    assertReceipt(receipt);
    expect(receipt.status).toBe("blocked");
    expect(receipt.findings.some((item) => item.ruleId === "issue-link" && !item.passed)).toBe(true);
    const cli = await captureCli(["preflight", "--repo", repo, "--base", "HEAD", "--json"]);
    expect(cli.code).toBe(1);
    expect(cli.stdout).toMatch(/"status":"blocked"/);
    expect(cli.stdout).toMatch(/issue-link/);
  });

  it("oversized preflight is blocked and asks to split the PR", async () => {
    const repo = await stageFixture("oversized");
    const { receipt } = await preflight({ repoPath: repo, baseRef: "HEAD" });
    expect(receipt.status).toBe("blocked");
    const maxFiles = receipt.findings.find((item) => item.ruleId === "max-files");
    expect(maxFiles?.passed).toBe(false);
    expect(maxFiles?.message).toMatch(/split the PR/i);
  });

  it("codeowners-path preflight is needs-human", async () => {
    const repo = await stageFixture("codeowners-path");
    const { receipt } = await preflight({ repoPath: repo, baseRef: "HEAD" });
    expect(receipt.status).toBe("needs-human");
    expect(receipt.findings.some((item) => item.ruleId === "codeowners" && !item.passed)).toBe(true);
    const cli = await captureCli(["preflight", "--repo", repo, "--base", "HEAD"]);
    expect(cli.code).toBe(0);
    expect(cli.stdout).toMatch(/needs-human/);
  });

  it("pass-clean preflight is pass when the snapshot is small and licensed", async () => {
    const repo = await stageFixture("pass-clean");
    const { contract, receipt } = await preflight({ repoPath: repo, baseRef: "HEAD" });
    assertContract(contract);
    expect(receipt.status).toBe("pass");
    const again = await preflight({ repoPath: repo, baseRef: "HEAD", evaluatedAt: "2026-08-22T00:00:00.000Z" });
    const once = await preflight({ repoPath: repo, baseRef: "HEAD", evaluatedAt: "2020-01-01T00:00:00.000Z" });
    expect(canonicalJson(receiptBodyOf(again.receipt))).toBe(canonicalJson(receiptBodyOf(once.receipt)));
    expect(again.receipt.digest).toBe(once.receipt.digest);
  });

  it("does not walk up to a parent git root", async () => {
    const nested = join(repoRoot, "fixtures", "repos", "pass-clean");
    await expect(preflight({ repoPath: nested, baseRef: "HEAD" })).rejects.toThrow(/not a git repository root/);
    const contract = await compile({ repoPath: nested });
    expect(contract.sources.some((item) => item.path === "LICENSE")).toBe(true);
    expect(contract.rules.some((rule) => rule.id === "issue-link")).toBe(false);
  });

  it("compile writes a schema-valid contract", async () => {
    const repo = await stageFixture("pass-clean");
    const cli = await captureCli(["compile", "--repo", repo, "--json"]);
    expect(cli.code).toBe(0);
    const parsed: unknown = JSON.parse(cli.stdout);
    assertContract(parsed);
  });
});

describe("dogfood", () => {
  it("compiles and preflights the contribkit repo", async () => {
    expect(existsSync(join(repoRoot, "LICENSE"))).toBe(true);
    const contract = await compile({ repoPath: repoRoot });
    assertContract(contract);
    expect(contract.sources.some((item) => item.path.endsWith("CONTRIBUTING.md"))).toBe(true);
    expect(contract.sources.some((item) => item.path === "LICENSE")).toBe(true);
    const { receipt } = await preflight({ repoPath: repoRoot, baseRef: "HEAD" });
    assertReceipt(receipt);
    expect(["pass", "blocked", "needs-human"]).toContain(receipt.status);
  });
});
