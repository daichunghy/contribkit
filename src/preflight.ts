import { spawn } from "node:child_process";
import { allowlistedArgv } from "./allowlist.js";
import { compile, type CompileOptions } from "./compile.js";
import { digestText } from "./canonical.js";
import { evaluate } from "./evaluate.js";
import { redactSecrets } from "./redact.js";
import { buildSnapshot, isGitRepo, RepoError, resolveRef } from "./repo.js";
import type { ContributionContract, EvaluationSnapshot, PreflightReceipt, RecordedCommand } from "./types.js";

export type CommandExecutor = (
  argv: readonly string[],
  cwd: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export async function spawnArgv(
  argv: readonly string[],
  cwd: string,
  timeoutMs = 120_000,
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
    let timedOut = false;
    let hardStop: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // A target test may deliberately ignore SIGTERM. Always bound its life.
      hardStop = setTimeout(() => { child.kill("SIGKILL"); }, 5_000);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (hardStop !== undefined) clearTimeout(hardStop);
      resolvePromise({
        exitCode: timedOut ? 124 : code ?? 1,
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

/**
 * Run each distinct allowlisted command required by the contract. A
 * multi-language repository may need more than one successful test record.
 * Execution is always sequential and requires explicit --run-tests.
 */
async function maybeRunTests(
  contract: ContributionContract,
  repoPath: string,
  runTests: boolean,
  existing: readonly RecordedCommand[],
  executeCommand: CommandExecutor,
): Promise<RecordedCommand[]> {
  const recorded = [...existing];
  if (!runTests) return recorded;

  const seen = new Set<string>();
  const commands: string[][] = [];
  for (const rule of [...contract.rules, ...contract.advisory, ...contract.needsHuman]) {
    if (rule.check !== "command_recorded" || rule.command === undefined) continue;
    const argv = allowlistedArgv(rule.command);
    if (argv === undefined) continue;
    const key = argv.join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    commands.push(argv);
  }
  // Bundled adapters currently expose at most 13 commands. Fail closed if
  // future configuration unexpectedly asks to execute an excessive number.
  if (commands.length > 16) {
    throw new Error("contribkit refuses to run more than 16 distinct test commands.");
  }

  for (const argv of commands) {
    try {
      const result = await executeCommand(argv, repoPath);
      const log = redactSecrets(result.stdout + "\n" + result.stderr);
      recorded.push({
        command: argv.join(" "),
        exitCode: result.exitCode,
        source: "executed",
        logDigest: digestText(log),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "spawn failed";
      recorded.push({
        command: argv.join(" "),
        exitCode: 127,
        source: "executed",
        logDigest: digestText(redactSecrets(message)),
      });
    }
  }
  return recorded;
}

export async function preflight(options: PreflightOptions): Promise<{
  contract: ContributionContract;
  snapshot: EvaluationSnapshot;
  receipt: PreflightReceipt;
}> {
  // An author-controlled HEAD can modify CONTRIBUTING or contribkit.yml.
  // Default to the caller's trusted diff base, not the proposed branch.
  // Reject a wrong/nested working directory or invalid base *before* any
  // opt-in target script has a chance to run.
  if (!(await isGitRepo(options.repoPath))) {
    throw new RepoError("not a git repository root: " + options.repoPath);
  }
  await resolveRef(options.repoPath, options.baseRef);
  const compileOpts = { repoPath: options.repoPath, ref: options.ref ?? options.baseRef };
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
