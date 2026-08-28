#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenRoots = new Set(["src", "test", "fixtures", "scripts"]);

function run(file, args, cwd) {
  return execFileSync(file, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, npm_config_prefer_offline: "true", npm_config_ignore_scripts: "true" },
  });
}

function fail(message) {
  throw new Error(`clean-room consumer smoke: ${message}`);
}

function packPackage(directory) {
  let payload;
  try {
    payload = JSON.parse(
      run("npm", ["pack", "--offline", "--ignore-scripts", "--json", "--pack-destination", directory], root),
    );
  } catch (error) {
    fail(`npm pack failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const entry = Array.isArray(payload) ? payload[0] : payload;
  if (entry === null || typeof entry !== "object" || typeof entry.filename !== "string") {
    fail("npm pack returned no tarball");
  }
  const files = Array.isArray(entry.files) ? entry.files : [];
  const forbidden = files
    .map((file) => (typeof file === "string" ? file : file?.path))
    .filter((file) => typeof file === "string")
    .filter((file) => forbiddenRoots.has(file.split("/")[0] ?? ""));
  if (forbidden.length > 0) {
    fail(`packed forbidden paths: ${forbidden.join(", ")}`);
  }
  return isAbsolute(entry.filename) ? entry.filename : join(directory, entry.filename);
}

async function main() {
  const temporary = await mkdtemp(join(tmpdir(), "contribkit-clean-room-"));
  try {
    const tarball = packPackage(temporary);
    const consumer = join(temporary, "consumer");
    await mkdir(consumer);
    run("npm", ["init", "-y", "--silent"], consumer);
    run(
      "npm",
      ["install", "--bin-links", "--ignore-scripts", "--no-package-lock", "--no-save", tarball],
      consumer,
    );

    const packageRoot = join(consumer, "node_modules", "contribkit");
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    if (packageJson.bin?.contribkit !== "dist/src/cli.js") fail("packed package bin mapping is missing or changed");
    const binary = join(packageRoot, "dist", "src", "cli.js");
    const version = run(process.execPath, [binary, "--version"], consumer).trim();
    if (!/^0\.1\.0-alpha\.\d+$/.test(version)) fail(`installed binary returned unexpected version: ${version}`);
    const help = run(process.execPath, [binary, "--help"], consumer);
    if (!help.includes("Contribution preflight")) fail("installed binary did not load the packaged CLI");
    run(
      process.execPath,
      ["--input-type=module", "-e", "import('contribkit').then(({ VERSION }) => { if (typeof VERSION !== 'string') process.exit(1); })"],
      consumer,
    );
    console.log(`clean-room consumer smoke: pass (${version})`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
