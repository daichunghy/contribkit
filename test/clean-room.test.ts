import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts", "check-clean-room.mjs");

describe("clean-room consumer", () => {
  it("installs the packed package and starts the packaged CLI without lifecycle scripts", () => {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/clean-room consumer smoke: pass \(0\.1\.0-alpha\.\d+\)/);
  });
});
