import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRecord } from "../src/types.js";
import { repoRoot } from "./helpers.js";

describe("T5 plugin hooks", () => {
  it("hooks.json matches Bash|PowerShell gh/glab and MCP create_pull_request, not git push", () => {
    const raw = readFileSync(join(repoRoot, "hooks/hooks.json"), "utf8");
    expect(raw).toMatch(/Bash\|PowerShell/);
    expect(raw).toMatch(/gh pr create/);
    expect(raw).toMatch(/glab mr create/);
    expect(raw).toMatch(/mcp__\.\*__create_pull_request/);

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.hooks)) {
      throw new Error("hooks.json missing hooks");
    }
    const pre = parsed.hooks.PreToolUse;
    if (!Array.isArray(pre)) throw new Error("PreToolUse missing");
    const matchers: string[] = [];
    for (const entry of pre) {
      if (!isRecord(entry) || typeof entry.matcher !== "string") continue;
      matchers.push(entry.matcher);
    }
    expect(matchers).toContain("Bash|PowerShell");
    expect(matchers).toContain("mcp__.*__create_pull_request");
    expect(matchers.some((item) => item.includes("git push") || item.includes("git request-pull"))).toBe(
      false,
    );
  });
});
