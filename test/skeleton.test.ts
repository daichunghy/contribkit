import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_CONTRACT,
  SCHEMA_POLICY,
  SCHEMA_RECEIPT,
  VERSION,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("P0 skeleton", () => {
  it("exports a dev version and schema ids", () => {
    expect(VERSION).toBe("0.1.0-dev");
    expect(SCHEMA_CONTRACT).toBe("contribkit.contract.v1");
    expect(SCHEMA_RECEIPT).toBe("contribkit.receipt.v1");
    expect(SCHEMA_POLICY).toBe("contribkit.policy.v1");
  });

  it("does not advertise an npm package that does not exist", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toMatch(/Not on npm/);
    expect(readme).not.toMatch(/img\.shields\.io\/npm/);
    expect(readme).not.toMatch(/npx contribkit/);
  });

  it("ships Apache-2.0", () => {
    const license = readFileSync(join(root, "LICENSE"), "utf8");
    expect(license).toMatch(/Apache License/);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      license: string;
      private: boolean;
    };
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.private).toBe(true);
  });
});
