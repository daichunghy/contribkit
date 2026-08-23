import { spawn } from "node:child_process";
import { allowlistedArgv } from "./allowlist.js";
import { compile, type CompileOptions } from "./compile.js";
import { digestText } from "./canonical.js";
import { evaluate } from "./evaluate.js";
import { redactSecrets } from "./redact.js";
import { buildSnapshot } from "./repo.js";
import type { ContributionContract, EvaluationSnapshot, PreflightReceipt, RecordedCommand } from "./types.js";

export type CommandExecutor = (
  argv: readonly string[],
  cwd: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export async function spawnArgv(
  argv: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cmd = argv[0];
  if (cmd === undefined) return { exitCode: 1, stdout: "", stderr: "empty argv" };
  const args = argv.slice(1);
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        CI: "1",
        LANG: "C",
        LC_ALL: "C",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        npm_config_userconfig: "/dev/null",
      },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outSize = 0;
    let errSize = 0;
    const outputCap = 256_000;
    child.stdout.on("data", (chunk: Buffer) => {
      if (outSize < outputCap) {
        const next = chunk.subarray(0, outputCap - outSize);
        out.push(next);
        outSize += next.length;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errSize < outputCap) {
        const next = chunk.subarray(0, outputCap - errSize);
        err.push(next);
        errSize += next.length;
      }
    });
    child.on("error", reject);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

export interface PreflightOptions extends CompileOptions {
  baseRef: string;
  prBodyDraft?: string;
  recordedCommands?: RecordedCommand[];
  runTests?: boolean;
  overridden?: boolean;
  evaluatedAt?: string;
  executeCommand?: CommandExecutor;
}

async function maybeRunTests(
  contract: ContributionContract,
  repoPath: string,
  runTests: boolean,
  existing: readonly RecordedCommand[],
  executeCommand: CommandExecutor,
): Promise<RecordedCommand[]> {
  const recorded = [...existing];
  if (!runTests) return recorded;
  const rule = [...contract.rules, ...contract.advisory, ...contract.needsHuman].find(
    (item) => item.check === "command_recorded" && item.command !== undefined,
  );
  const command = rule?.command;
  if (command === undefined) return recorded;
  const argv = allowlistedArgv(command);
  if (argv === undefined) return recorded;
  try {
    const result = await executeCommand(argv, repoPath);
    const log = redactSecrets(`${result.stdout}\n${result.stderr}`);
    const entry: RecordedCommand = {
      command: argv.join(" "),
      exitCode: result.exitCode,
      source: "executed",
      logDigest: digestText(log),
    };
    recorded.push(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "spawn failed";
    recorded.push({
      command: argv.join(" "),
      exitCode: 127,
      source: "executed",
      logDigest: digestText(redactSecrets(message)),
    });
  }
  return recorded;
}

export async function preflight(options: PreflightOptions): Promise<{
  contract: ContributionContract;
  snapshot: EvaluationSnapshot;
  receipt: PreflightReceipt;
}> {
  const compileOpts = { repoPath: options.repoPath, ...(options.ref !== undefined ? { ref: options.ref } : {}) };
  const contract = await compile(compileOpts);
  const recorded = await maybeRunTests(
    contract,
    options.repoPath,
    options.runTests === true,
    options.recordedCommands ?? [],
    options.executeCommand ?? spawnArgv,
  );
  const snapshotExtra: { prBodyDraft?: string; recordedCommands?: RecordedCommand[] } = {
    recordedCommands: recorded,
  };
  if (options.prBodyDraft !== undefined) snapshotExtra.prBodyDraft = options.prBodyDraft;
  const snapshot = await buildSnapshot(options.repoPath, options.baseRef, snapshotExtra);
  const evalOpts: { overridden?: boolean; evaluatedAt?: string } = {};
  if (options.overridden === true) evalOpts.overridden = true;
  if (options.evaluatedAt !== undefined) evalOpts.evaluatedAt = options.evaluatedAt;
  const receipt = evaluate(contract, snapshot, evalOpts);
  return { contract, snapshot, receipt };
}
