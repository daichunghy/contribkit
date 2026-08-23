#!/usr/bin/env node
/**
 * Claude Code PreToolUse handler. Deny PR-create tools when preflight is blocked
 * and CONTRIBKIT_ALLOW is unset. Does not rewrite argv.
 */
import { preflight } from "./preflight.js";
import { git } from "./repo.js";
import { isRecord } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
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
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let cwd = process.cwd();
  let parsed: Record<string, unknown> | undefined;
  if (raw.trim().length > 0) {
    try {
      const candidate: unknown = JSON.parse(raw);
      if (isRecord(candidate)) {
        parsed = candidate;
      }
      if (parsed && typeof parsed.cwd === "string" && parsed.cwd.length > 0) {
        cwd = parsed.cwd;
      }
    } catch {
      deny("contribkit hook could not parse its JSON input");
      return;
    }
  }

  const requestedBase =
    (parsed && typeof parsed.baseRef === "string" && parsed.baseRef) ||
    (parsed && typeof parsed.base_ref === "string" && parsed.base_ref) ||
    process.env.CONTRIBKIT_BASE_REF;
  const candidates = [requestedBase, "origin/main", "origin/HEAD", "main", "HEAD~1"].filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  let baseRef: string | undefined;
  for (const candidate of candidates) {
    const result = await git(cwd, ["rev-parse", "--verify", candidate]);
    if (result.code === 0) {
      baseRef = candidate;
      break;
    }
  }
  if (baseRef === undefined) {
    deny("contribkit could not determine a trusted base ref; set CONTRIBKIT_BASE_REF");
    return;
  }

  const nestedToolInput = parsed && isRecord(parsed.tool_input) ? parsed.tool_input : undefined;
  const prBodyDraft =
    (parsed && typeof parsed.prBodyDraft === "string" && parsed.prBodyDraft) ||
    (parsed && typeof parsed.body === "string" && parsed.body) ||
    (nestedToolInput && typeof nestedToolInput.body === "string" && nestedToolInput.body) ||
    undefined;

  const allow = process.env.CONTRIBKIT_ALLOW === "1";
  const { receipt } = await preflight({
    repoPath: cwd,
    baseRef,
    ...(prBodyDraft !== undefined ? { prBodyDraft } : {}),
    overridden: allow,
  });

  if (receipt.status === "blocked" && !allow) {
    const blockers = receipt.findings
      .filter((item) => !item.passed && item.severity === "block")
      .map((item) => `${item.ruleId}: ${item.message}`);
    const reason = blockers.length > 0 ? blockers.join("; ") : "contribkit preflight blocked";
    deny(reason);
    return;
  }
  // Silent exit 0 does not approve the tool.
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  deny(`contribkit hook error: ${message}`);
});
