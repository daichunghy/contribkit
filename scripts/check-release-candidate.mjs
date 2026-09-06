#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "package.json",
  "package-lock.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/first-use.md",
  "docs/release-and-rollback.md",
];
const adapterFiles = ["adapter.json", "README.md", "hints.yml", "tests/golden.json"];
const forbiddenPackedRoots = /^(?:src|test|fixtures|scripts|\.github)(?:\/|$)/;
const alphaVersion = /^0\.1\.0-alpha\.(0|[1-9]\d*)$/;

function readJson(root, relativePath, failures) {
  const path = join(root, relativePath);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    failures.push(`invalid or unreadable JSON: ${relativePath}${detail}`);
    return undefined;
  }
}

function isFile(root, relativePath) {
  try {
    return statSync(join(root, relativePath)).isFile();
  } catch {
    return false;
  }
}

function parsePackFiles(stdout) {
  const starts = [stdout.indexOf("["), stdout.indexOf("{")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  for (const start of starts) {
    try {
      const payload = JSON.parse(stdout.slice(start));
      const packageInfo = Array.isArray(payload) ? payload[0] : payload;
      if (!packageInfo || !Array.isArray(packageInfo.files)) return undefined;
      return packageInfo.files
        .map((entry) => (typeof entry === "string" ? entry : entry?.path))
        .filter((path) => typeof path === "string")
        .map((path) => path.replaceAll("\\", "/"));
    } catch {
      // npm may prefix JSON with a warning; try the next possible JSON start.
    }
  }
  return undefined;
}

function pack(root) {
  return spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_offline: "true" },
  });
}

function resolveRoot(args) {
  if (args.length === 0) return defaultRoot;
  if (args.length === 2 && args[0] === "--root") {
    return isAbsolute(args[1]) ? args[1] : resolve(process.cwd(), args[1]);
  }
  throw new Error("usage: node scripts/check-release-candidate.mjs [--root PATH]");
}

export function checkReleaseCandidate(root) {
  const failures = [];
  for (const relativePath of requiredFiles) {
    if (!isFile(root, relativePath)) failures.push(`missing required release file: ${relativePath}`);
  }

  const packageJson = readJson(root, "package.json", failures);
  const packageLock = readJson(root, "package-lock.json", failures);
  if (packageJson !== undefined) {
    if (packageJson.private !== false) failures.push("package.json must declare private=false");
    if (typeof packageJson.version !== "string" || !alphaVersion.test(packageJson.version)) {
      failures.push("package.json version must match 0.1.0-alpha.N");
    }
  }
  if (packageJson !== undefined && packageLock !== undefined) {
    if (packageLock.name !== packageJson.name) failures.push("package-lock.json name must match package.json");
    if (packageLock.version !== packageJson.version) failures.push("package-lock.json version must match package.json");
  }

  const adaptersPath = join(root, "adapters");
  let adapterNames = [];
  try {
    adapterNames = readdirSync(adaptersPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    failures.push("missing bundled adapters directory: adapters");
  }
  if (adapterNames.length === 0) failures.push("no bundled adapters found");
  for (const name of adapterNames) {
    for (const relativePath of adapterFiles) {
      const adapterFile = `adapters/${name}/${relativePath}`;
      if (!isFile(root, adapterFile)) failures.push(`adapter ${name} is missing ${relativePath}`);
    }
  }

  let packedPaths = [];
  const result = pack(root);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "npm pack failed").trim();
    failures.push(`npm pack --dry-run failed: ${detail.split("\n").slice(-3).join("\n")}`);
  } else {
    packedPaths = parsePackFiles(result.stdout) ?? [];
    if (packedPaths.length === 0) failures.push("npm pack returned no parseable file list");
    const leaked = packedPaths.filter((path) => forbiddenPackedRoots.test(path));
    for (const path of leaked) failures.push(`development-only path leaked into package: ${path}`);
  }

  return { failures, adapterNames, packedPaths };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolveRoot(process.argv.slice(2));
    const result = checkReleaseCandidate(root);
    if (result.failures.length > 0) {
      process.stderr.write(`release candidate check failed:\n${result.failures.map((item) => `- ${item}`).join("\n")}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `release candidate check passed: ${result.packedPaths.length} packed files; ` +
          `${result.adapterNames.length} adapters; offline\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
