#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const failures = [];

if (packageJson.private !== false) failures.push("package.json must remain publishable (private=false)");
if (packageJson.exports?.["."]?.default !== "./dist/src/index.js") {
  failures.push("package.json root export must target ./dist/src/index.js");
}

const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: root,
  encoding: "utf8",
});
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "npm pack failed\n");
  process.exit(1);
}

const jsonStart = pack.stdout.indexOf("[");
const payload = JSON.parse(jsonStart >= 0 ? pack.stdout.slice(jsonStart) : pack.stdout);
const files = (Array.isArray(payload) ? payload[0]?.files : payload?.files) ?? [];
const paths = files.map((file) => file.path ?? file).sort();
const pathSet = new Set(paths);

const allowed = /^(package\.json|LICENSE|README\.md|\.mcp\.json|dist\/|schemas\/|adapters\/|\.claude-plugin\/|hooks\/|skills\/|docs\/)/;
const forbidden = paths.filter((path) => !allowed.test(path));
if (forbidden.length > 0) failures.push(`unexpected packed paths:\n${forbidden.join("\n")}`);

const required = [
  "package.json",
  "LICENSE",
  "README.md",
  "dist/src/index.js",
  "dist/src/index.d.ts",
  "dist/src/cli.js",
  "schemas/contract.v1.json",
  "schemas/receipt.v1.json",
  "schemas/policy.v1.json",
];
for (const path of required) {
  if (!pathSet.has(path)) failures.push(`required packed path is missing: ${path}`);
}

const adapterNames = readdirSync(join(root, "adapters"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of adapterNames) {
  for (const suffix of ["adapter.json", "README.md", "hints.yml"]) {
    const path = `adapters/${name}/${suffix}`;
    if (!pathSet.has(path)) failures.push(`adapter ${name} is missing packed ${suffix}`);
  }
}

const forbiddenSubstrings = [/^src\//, /^test\//, /^fixtures\//, /^\.github\//, /^scripts\//, /^\.npmignore$/];
for (const path of paths) {
  if (forbiddenSubstrings.some((pattern) => pattern.test(path))) {
    failures.push(`development-only path leaked into package: ${path}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`package surface check failed:\n${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`package surface check passed: ${paths.length} files; ${adapterNames.length} adapters\n`);
