#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "src", "cli.js");

function usage() {
  return [
    "Usage: node scripts/first-use-smoke.mjs [options]",
    "",
    "Runs preflight, keeps its receipt, then runs explain even when preflight is blocked.",
    "",
    "Options:",
    "  --repo <path>         Target git clone root (default: .)",
    "  --base <git-ref>      Base ref for the diff (default: HEAD)",
    "  --body-file <path>    Draft pull-request body",
    "  --out <path>          Receipt path (default: a unique file in /tmp)",
    "  --run-tests           Opt in to the CLI's allowlisted target test command",
    "  --help                Show this help",
  ].join("\n");
}

function valueFor(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    repo: ".",
    base: "HEAD",
    out: join(tmpdir(), `contribkit-first-use-${process.pid}.json`),
    runTests: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") return { help: true, options };
    if (arg === "--run-tests") {
      options.runTests = true;
      continue;
    }
    if (arg === "--repo") {
      options.repo = valueFor(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--base") {
      options.base = valueFor(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--body-file") {
      options.bodyFile = valueFor(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.out = valueFor(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return { help: false, options };
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    return 2;
  }
  return result.status ?? 2;
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    return 2;
  }
  if (parsed.help) {
    console.log(usage());
    return 0;
  }
  if (!existsSync(cli)) {
    console.error(`missing ${cli}; run npm run build first`);
    return 2;
  }

  const { options } = parsed;
  const invocationCwd = process.cwd();
  const repo = resolve(invocationCwd, options.repo);
  const out = resolve(invocationCwd, options.out);
  const preflightArgs = ["preflight", "--repo", repo, "--base", options.base, "--out", out];
  if (options.bodyFile !== undefined) {
    preflightArgs.push("--body-file", resolve(invocationCwd, options.bodyFile));
  }
  if (options.runTests) preflightArgs.push("--run-tests");

  console.log(`receipt: ${out}`);
  const preflightStatus = runCli(preflightArgs);
  if (preflightStatus !== 0 && preflightStatus !== 1) return preflightStatus;
  if (!existsSync(out)) {
    console.error(`preflight did not write ${out}`);
    return 2;
  }

  const explainStatus = runCli(["explain", out]);
  if (explainStatus !== 0) return explainStatus;
  return preflightStatus;
}

process.exitCode = main();
