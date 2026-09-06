import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { repoRoot } from "./helpers.js";

const script = join(repoRoot, "scripts", "check-release-candidate.mjs");
const temporaryRoots: string[] = [];

async function releaseFixture(options: {
  privatePackage?: boolean;
  includeLeak?: boolean;
  includeGolden?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "ck-release-candidate-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "adapters", "fixture", "tests"), { recursive: true });
  if (options.includeLeak) await mkdir(join(root, "src"), { recursive: true });
  const packageJson = {
    name: "release-fixture",
    version: "0.1.0-alpha.1",
    private: options.privatePackage ?? false,
    files: options.includeLeak
      ? ["src", "adapters/*/adapter.json", "adapters/*/README.md", "adapters/*/hints.yml"]
      : ["adapters/*/adapter.json", "adapters/*/README.md", "adapters/*/hints.yml"],
  };
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
  await writeFile(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: packageJson.name,
      version: packageJson.version,
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: packageJson.name, version: packageJson.version } },
    }),
  );
  for (const file of ["README.md", "LICENSE", "CHANGELOG.md", "docs/first-use.md", "docs/release-and-rollback.md"]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "fixture\n");
  }
  await writeFile(join(root, "adapters", "fixture", "adapter.json"), "{}\n");
  await writeFile(join(root, "adapters", "fixture", "README.md"), "fixture\n");
  await writeFile(join(root, "adapters", "fixture", "hints.yml"), "{}\n");
  if (options.includeGolden !== false) {
    await writeFile(join(root, "adapters", "fixture", "tests", "golden.json"), "{}\n");
  }
  if (options.includeLeak) await writeFile(join(root, "src", "leak.js"), "leak\n");
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [script, "--root", root], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_offline: "true" },
  });
}

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("release candidate gate", () => {
  it("passes the current package and reports the bundled adapter count", () => {
    const result = run(repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release candidate check passed");
    expect(result.stdout).toContain("11 adapters");
  });

  it("rejects a package that exposes a development-only path", async () => {
    const root = await releaseFixture({ includeLeak: true });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("development-only path leaked into package: src/leak.js");
  });

  it("rejects private packages even when their other release files are present", async () => {
    const root = await releaseFixture({ privatePackage: true });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("package.json must declare private=false");
  });

  it("rejects a bundled adapter without its golden fixture", async () => {
    const root = await releaseFixture({ includeGolden: false });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("adapter fixture is missing tests/golden.json");
  });
});
