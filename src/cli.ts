#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveTrustedBase } from "./base.js";
import { canonicalJson } from "./canonical.js";
import { compile } from "./compile.js";
import { explainReceipt, formatReceipt, statusExitCode } from "./explain.js";
import { preflight } from "./preflight.js";
import { buildSnapshot, currentBranch, isGitRepo, RepoError } from "./repo.js";
import { assertReceipt } from "./schema.js";
import { verifyReceiptDigest } from "./receipt.js";
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
    "contribkit " + VERSION,
    "Check contribution rules before opening a pull request.",
    "",
    "Start here",
    "  contribkit doctor [--repo PATH] [--base TRUSTED_REF] [--json]",
    "  contribkit check  [--repo PATH] [--base TRUSTED_REF] [--body-file FILE]",
    "",
    "Advanced",
    "  contribkit preflight [check options] [--run-tests] [--strict] [--json] [--out FILE]",
    "  contribkit compile --repo PATH [--ref REF] [--json] [--out FILE]",
    "  contribkit explain RECEIPT.json [--json]",
    "  contribkit mcp",
    "",
    "check is an alias for preflight. Both discover origin/HEAD, origin/main, or origin/master.",
    "No remote baseline? Specify --base yourself (HEAD only scans uncommitted changes).",
    "Never run target tests unless you explicitly pass --run-tests.",
    "Exit codes: pass=0, blocked=1, argument/configuration error=2,",
    "  needs-human=0 (default), needs-human=3 with --strict.",
    "Overrides with --allow or CONTRIBKIT_ALLOW=1 are recorded, never hidden.",
    "Use --help to return to this guide. Source checkout may be newer than npm alpha.",
  ].join("\n");
}

interface ParsedOptions {
  values: Map<string, string>;
  switches: Set<string>;
  positionals: string[];
}
const CONFIG: Record<string, { values: readonly string[]; switches: readonly string[]; positionals: number }> = {
  check: {
    values: ["--repo", "--base", "--ref", "--body", "--body-file", "--out"],
    switches: ["--json", "--run-tests", "--strict", "--allow"],
    positionals: 0,
  },
  preflight: {
    values: ["--repo", "--base", "--ref", "--body", "--body-file", "--out"],
    switches: ["--json", "--run-tests", "--strict", "--allow"],
    positionals: 0,
  },
  compile: {
    values: ["--repo", "--ref", "--out"],
    switches: ["--json"],
    positionals: 0,
  },
  doctor: {
    values: ["--repo", "--base"],
    switches: ["--json"],
    positionals: 0,
  },
  explain: {
    values: [],
    switches: ["--json"],
    positionals: 1,
  },
  mcp: { values: [], switches: [], positionals: 0 },
};

function parseArgs(command: string, args: readonly string[]): ParsedOptions {
  const spec = CONFIG[command];
  if (!spec) throw new RepoError("unknown command: " + command);
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    if (token === "--") throw new RepoError("positional argument separator is not supported");
    const equalsAt = token.indexOf("=");
    const name = equalsAt > 0 ? token.slice(0, equalsAt) : token;
    if (spec.switches.includes(name)) {
      if (equalsAt !== -1) throw new RepoError("boolean option takes no value: " + name);
      if (switches.has(name)) throw new RepoError("duplicate option: " + name);
      switches.add(name);
      continue;
    }
    if (!spec.values.includes(name)) throw new RepoError("unknown option for " + command + ": " + name);
    if (values.has(name)) throw new RepoError("duplicate option: " + name);
    const value = equalsAt > 0 ? token.slice(equalsAt + 1) : args[++i];
    if (value === undefined || value.length === 0 || (equalsAt === -1 && value.startsWith("--"))) {
      throw new RepoError("missing value for " + name);
    }
    values.set(name, value);
  }
  if (positionals.length !== spec.positionals) {
    throw new RepoError(command + " expects " + spec.positionals + " positional arguments");
  }
  if (values.has("--body") && values.has("--body-file")) {
    throw new RepoError("choose only one of --body and --body-file");
  }
  return { values, switches, positionals };
}

async function readBodyFile(file: string): Promise<string> {
  const info = await stat(file);
  if (!info.isFile() || info.size > 1_000_000) {
    throw new RepoError("--body-file must be a text file no larger than 1 MB");
  }
  return await readFile(file, "utf8");
}

async function writeOut(path: string | undefined, content: string): Promise<void> {
  if (path !== undefined) {
    await writeFile(path, content.endsWith("\n") ? content : content + "\n", "utf8");
  }
}

async function doctor(repo: string, explicitBase: string | undefined, json: boolean, io: CliIo): Promise<number> {
  if (!(await isGitRepo(repo))) {
    throw new RepoError("not a Git repository root: " + repo + ". Use --repo to select the clone root.");
  }
  const branch = await currentBranch(repo);
  let base;
  try {
    base = await resolveTrustedBase(repo, explicitBase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      io.stdout.write(canonicalJson({ schema: "contribkit.doctor.v1", ready: false, branch: branch ?? null, reason: message }) + "\n");
    } else {
      io.stdout.write("contribkit doctor: needs setup\n" + message + "\n");
      io.stdout.write("Next: git fetch origin, or supply --base <trusted-ref>.\n");
    }
    return 1;
  }
  const contract = await compile({ repoPath: repo, ref: base.sha });
  const snapshot = await buildSnapshot(repo, base.sha);
  const report = {
    schema: "contribkit.doctor.v1",
    ready: true,
    branch: branch ?? null,
    base: base.ref,
    baseSha: base.sha,
    baseSource: base.source,
    changedFiles: snapshot.diffStat.files,
    rules: contract.rules.length,
    advisory: contract.advisory.length,
    needsHuman: contract.needsHuman.length,
  };
  if (json) {
    io.stdout.write(canonicalJson(report) + "\n");
  } else {
    io.stdout.write("contribkit doctor: ready to inspect (not an approval)\n");
    io.stdout.write("  branch: " + (branch ?? "detached HEAD") + "\n");
    io.stdout.write("  trusted base: " + base.ref + " (" + base.sha.slice(0, 10) + ")\n");
    io.stdout.write("  changed files: " + snapshot.diffStat.files + "\n");
    io.stdout.write("  contract checks: " + (contract.rules.length + contract.advisory.length + contract.needsHuman.length) + "\n");
    io.stdout.write("Next: contribkit check --base " + base.ref + "\n");
    if (base.source === "remote") {
      io.stdout.write("Note: remote-tracking refs are cached locally; fetch origin to refresh them.\n");
    }
  }
  return 0;
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    io.stdout.write(help() + "\n");
    return 0;
  }
  if (command === "-v" || command === "--version" || command === "version") {
    io.stdout.write(VERSION + "\n");
    return 0;
  }

  try {
    const args = parseArgs(command, argv.slice(1));
    const value = (key: string): string | undefined => args.values.get(key);
    const flagged = (key: string): boolean => args.switches.has(key);
    if (command === "compile") {
      const repo = value("--repo") ?? ".";
      const ref = value("--ref");
      const contract = await compile(ref ? { repoPath: repo, ref } : { repoPath: repo });
      const content = canonicalJson(contract) + "\n";
      await writeOut(value("--out"), content);
      if (flagged("--json")) io.stdout.write(content);
      else if (value("--out")) io.stdout.write("wrote " + value("--out") + "\n");
      else io.stdout.write("compiled " + contract.schema + " (" +
        (contract.rules.length + contract.advisory.length + contract.needsHuman.length) + " checks)\n");
      return 0;
    }

    if (command === "doctor") {
      return await doctor(value("--repo") ?? ".", value("--base"), flagged("--json"), io);
    }

    if (command === "check" || command === "preflight") {
      const repo = value("--repo") ?? ".";
      const base = await resolveTrustedBase(repo, value("--base"));
      const body = value("--body-file") !== undefined
        ? await readBodyFile(value("--body-file") ?? "")
        : value("--body");
      const result = await preflight({
        repoPath: repo,
        baseRef: base.sha,
        runTests: flagged("--run-tests"),
        overridden: flagged("--allow") || io.env.CONTRIBKIT_ALLOW === "1",
        ...(body !== undefined ? { prBodyDraft: body } : {}),
        ...(value("--ref") !== undefined ? { ref: value("--ref") } : {}),
      });
      const receipt = result.receipt;
      const content = canonicalJson(receipt) + "\n";
      await writeOut(value("--out"), content);
      if (flagged("--json")) io.stdout.write(content);
      else {
        io.stdout.write("base " + base.ref + " (" + base.sha.slice(0, 10) + ")\n");
        io.stdout.write(formatReceipt(receipt));
      }
      return statusExitCode(receipt.status, flagged("--strict"));
    }

    if (command === "explain") {
      const path = args.positionals[0] ?? "";
      const raw = await readFile(resolve(path), "utf8");
      const parsed: unknown = JSON.parse(raw);
      assertReceipt(parsed);
      const receipt: PreflightReceipt = parsed;
      verifyReceiptDigest(receipt);
      io.stdout.write(flagged("--json") ? canonicalJson(receipt) + "\n" : explainReceipt(receipt));
      return 0;
    }

    if (command === "mcp") {
      const { runMcpStdio } = await import("./mcp.js");
      await runMcpStdio();
      return 0;
    }
    throw new RepoError("unknown command: " + command);
  } catch (error) {
    if (error instanceof RepoError) {
      io.stderr.write(error.message + "\n");
      return error.exitCode;
    }
    io.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
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
    (code) => { process.exitCode = code; },
    (error: unknown) => {
      process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
      process.exitCode = 2;
    },
  );
}
