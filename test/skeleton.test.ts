import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isDirectRun } from "../src/cli.js";
import {
  SCHEMA_CONTRACT,
  SCHEMA_POLICY,
  SCHEMA_RECEIPT,
  VERSION,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("P0 skeleton", () => {
  it("exports a version and schema ids", () => {
    expect(VERSION).toBe("0.1.0-alpha.5");
    expect(SCHEMA_CONTRACT).toBe("contribkit.contract.v1");
    expect(SCHEMA_RECEIPT).toBe("contribkit.receipt.v1");
    expect(SCHEMA_POLICY).toBe("contribkit.policy.v1");
  });

  it("treats the npx contribkit shim as a direct run", () => {
    expect(isDirectRun("/Users/me/.npm/_npx/pkg/node_modules/.bin/contribkit")).toBe(true);
    expect(isDirectRun("/tmp/dist/src/cli.js")).toBe(true);
    expect(isDirectRun("/tmp/unrelated.js")).toBe(false);
  });

  it("documents the published npm package without a marketplace catalog claim", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toMatch(/npx contribkit/);
    expect(readme).toMatch(/img\.shields\.io\/npm\/v\/contribkit/);
    expect(readme).not.toMatch(/Not on npm/);
    expect(readme).not.toMatch(/claude-plugins-community catalog/);
  });

  it("ships Apache-2.0", () => {
    const license = readFileSync(join(root, "LICENSE"), "utf8");
    expect(license).toMatch(/Apache License/);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      license: string;
      private?: boolean;
    };
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.private).toBe(false);
  });
});
