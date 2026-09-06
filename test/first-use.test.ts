import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { assertReceipt } from "../src/schema.js";
import { stageFixture } from "./helpers.js";

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

describe("first-use CLI path", () => {
  it("routes the package first-use script through the receipt-preserving helper", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: { "first-use": string } };

    expect(packageJson.scripts["first-use"]).toBe(
      "npm run build && node scripts/first-use-smoke.mjs --repo . --base HEAD --run-tests",
    );
  });

  it("keeps a blocked receipt available for explain", async () => {
    const repo = await stageFixture("missing-issue");
    const outputDir = await mkdtemp(join(tmpdir(), "ck-first-use-"));
    const receiptPath = join(outputDir, "receipt.json");
    try {
      const preflight = await captureCli([
        "preflight",
        "--repo",
        repo,
        "--base",
        "HEAD",
        "--out",
        receiptPath,
      ]);

      expect(preflight.code).toBe(1);
      expect(existsSync(receiptPath)).toBe(true);
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as unknown;
      assertReceipt(receipt);
      expect(receipt.status).toBe("blocked");

      const explained = await captureCli(["explain", receiptPath]);
      expect(explained.code).toBe(0);
      expect(explained.stdout).toContain("issue-link");
      expect(explained.stdout).toMatch(/Link an issue/i);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });
});
