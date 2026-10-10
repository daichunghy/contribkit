#!/usr/bin/env node
/**
 * Claude Code PreToolUse: guard PR creation, never ordinary shell commands.
 * Does not rewrite argv or approve a tool call.
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolvePrBaseRef, resolveTrustedBase } from "./base.js";
import { classifyHookInput } from "./hook-input.js";
import { preflight } from "./preflight.js";
import { isRecord } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += next.length;
    if (length > 1_000_000) throw new Error("hook JSON input exceeds 1 MB");
    chunks.push(next);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function deny(reason: string): void {
  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function readPrBodyFile(file: string, cwd: string): Promise<string> {
  if (file === "-") throw new Error("body file '-' (stdin) is not supported by the hook; supply --body or a readable file");
  const candidate = isAbsolute(file) ? file : resolve(cwd, file);
  const info = await stat(candidate);
  if (!info.isFile() || info.size > 1_000_000) throw new Error("PR body file must be a text file <= 1 MB");
  return await readFile(candidate, "utf8");
}

/**
 * Exported for in-process fixture tests. Unknown inputs deny; unrelated tools
 * pass without checking the repository or invoking Git.
 */
export async function handleHookEvent(
  payload: unknown,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string | undefined> {
  const target = classifyHookInput(payload);
  if (target.action === "ignore") return undefined;
  if (target.action === "invalid") return target.reason;
  const parsed = isRecord(payload) ? payload : {};
  const cwd = typeof parsed.cwd === "string" && parsed.cwd.length > 0 ? parsed.cwd : options.cwd;
  const explicitlyConfigured =
    (typeof parsed.baseRef === "string" && parsed.baseRef) ||
    (typeof parsed.base_ref === "string" && parsed.base_ref) ||
    options.env.CONTRIBKIT_BASE_REF;
  try {
    const requested = explicitlyConfigured ??
      (target.requestedBase !== undefined ? await resolvePrBaseRef(cwd, target.requestedBase) : undefined);
    const base = await resolveTrustedBase(cwd, requested);
    const body = target.body ??
      (target.bodyFile !== undefined ? await readPrBodyFile(target.bodyFile, cwd) : undefined) ??
      (typeof parsed.prBodyDraft === "string" ? parsed.prBodyDraft : undefined);
    const allow = options.env.CONTRIBKIT_ALLOW === "1";
    const { receipt } = await preflight({
      repoPath: cwd,
      baseRef: base.sha,
      ...(body !== undefined ? { prBodyDraft: body } : {}),
      overridden: allow,
    });
    if (receipt.status === "blocked" && !allow) {
      const blockers = receipt.findings.filter((item) => !item.passed && item.severity === "block");
      const steps = blockers.map((item) => item.ruleId + ": " + item.message);
      return steps.length > 0 ? steps.join("; ") : "contribkit preflight blocked";
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const parsed: unknown = JSON.parse(raw);
    const denial = await handleHookEvent(parsed, { cwd: process.cwd(), env: process.env });
    if (denial !== undefined) deny(denial);
  } catch (error) {
    deny("contribkit hook error: " + (error instanceof Error ? error.message : String(error)));
  }
}

function isDirectRun(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && pathToFileURL(resolve(argv1)).href === import.meta.url;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    deny("contribkit hook error: " + (error instanceof Error ? error.message : String(error)));
  });
}
