#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "./canonical.js";
import { compile } from "./compile.js";
import { explainReceipt, formatReceipt, statusExitCode } from "./explain.js";
import { preflight } from "./preflight.js";
import { RepoError } from "./repo.js";
import { assertReceipt } from "./schema.js";
import { VERSION } from "./version.js";
import type { PreflightReceipt } from "./types.js";

export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  env: NodeJS.ProcessEnv;
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
};

function help(): string {
  return [
    `contribkit ${VERSION}`,
    "Contribution preflight — do not open the PR until the repo contract is satisfied.",
    "",
    "Usage:",
    "  contribkit compile --repo <path> [--ref <git-ref>] [--out <file>] [--json]",
    "  contribkit preflight --repo <path> --base <git-ref> [--body <text> | --body-file <file>]",
    "                       [--out <file>] [--json] [--run-tests] [--allow]",
    "  contribkit explain <receipt.json> [--json]",
    "  contribkit mcp",
    "",
    "Exit codes (preflight): blocked → 1; pass and needs-human → 0.",
    "CONTRIBKIT_ALLOW=1 or --allow sets receipt.overridden = true; it does not rewrite argv.",
    "--run-tests is opt-in and only executes allowlisted argv (no pipes, &&, or $()).",
    "",
    "Install: clone the release tag, npm ci, npm run build,",
    "then node dist/src/cli.js <command>. npm alpha publication is pending OTP.",
  ].join("\n");
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

async function writeOut(path: string | undefined, text: string): Promise<void> {
  if (path === undefined) return;
  await writeFile(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === "-h" || command === "--help") {
    io.stdout.write(`${help()}\n`);
    return 0;
  }
  if (command === "-v" || command === "--version" || command === "version") {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const json = hasFlag(argv, "--json");
  const out = flagValue(argv, "--out");

  try {
    if (command === "compile") {
      const repo = flagValue(argv, "--repo") ?? ".";
      const ref = flagValue(argv, "--ref");
      const compileOpts = ref === undefined ? { repoPath: repo } : { repoPath: repo, ref };
      const contract = await compile(compileOpts);
      const text = `${canonicalJson(contract)}\n`;
      await writeOut(out, text);
      if (json || out === undefined) {
        if (json) io.stdout.write(text);
        else {
          io.stdout.write(
            `compiled ${contract.schema} ref ${contract.ref} sources ${String(contract.sources.length)} rules ${String(contract.rules.length + contract.advisory.length + contract.needsHuman.length)}\n`,
          );
        }
      } else {
        io.stdout.write(`wrote ${out}\n`);
      }
      return 0;
    }

    if (command === "preflight") {
      const repo = flagValue(argv, "--repo") ?? ".";
      const base = flagValue(argv, "--base") ?? "HEAD";
      const bodyFlag = flagValue(argv, "--body");
      const bodyFile = flagValue(argv, "--body-file");
      let prBodyDraft: string | undefined = bodyFlag;
      if (bodyFile !== undefined) {
        prBodyDraft = await readFile(bodyFile, "utf8");
      }
      const allow = hasFlag(argv, "--allow") || io.env.CONTRIBKIT_ALLOW === "1";
      const ref = flagValue(argv, "--ref");
      const { receipt } = await preflight({
        repoPath: repo,
        baseRef: base,
        runTests: hasFlag(argv, "--run-tests"),
        overridden: allow,
        ...(prBodyDraft !== undefined ? { prBodyDraft } : {}),
        ...(ref !== undefined ? { ref } : {}),
      });
      const encoded = `${canonicalJson(receipt)}\n`;
      await writeOut(out, encoded);
      if (json) io.stdout.write(encoded);
      else io.stdout.write(formatReceipt(receipt));
      return statusExitCode(receipt.status);
    }

    if (command === "explain") {
      const file = argv[1];
      if (file === undefined || file.startsWith("-")) {
        io.stderr.write("usage: contribkit explain <receipt.json>\n");
        return 2;
      }
      const raw = await readFile(resolve(file), "utf8");
      const parsed: unknown = JSON.parse(raw);
      assertReceipt(parsed);
      const receipt: PreflightReceipt = parsed;
      if (json) io.stdout.write(`${canonicalJson(receipt)}\n`);
      else io.stdout.write(explainReceipt(receipt));
      return 0;
    }

    if (command === "mcp") {
      const { runMcpStdio } = await import("./mcp.js");
      await runMcpStdio();
      return 0;
    }

    if (command === "help") {
      io.stdout.write(`${help()}\n`);
      return 0;
    }

    io.stderr.write(`unknown command: ${command}\n${help()}\n`);
    return 2;
  } catch (error) {
    if (error instanceof RepoError) {
      io.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 2;
  }
}

export function isDirectRun(argv1 = process.argv[1], moduleHref = import.meta.url): boolean {
  if (argv1 === undefined) return false;
  const name = basename(argv1);
  if (name === "contribkit" || name.startsWith("cli")) return true;
  try {
    return moduleHref === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    try {
      return moduleHref === pathToFileURL(resolve(argv1)).href;
    } catch {
      return false;
    }
  }
}

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 2;
    },
  );
}
