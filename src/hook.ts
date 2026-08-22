#!/usr/bin/env node
/**
 * Claude Code PreToolUse handler. Deny PR-create tools when preflight is blocked
 * and CONTRIBKIT_ALLOW is unset. Does not rewrite argv.
 */
import { preflight } from "./preflight.js";
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
  if (raw.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.cwd === "string" && parsed.cwd.length > 0) {
        cwd = parsed.cwd;
      }
    } catch {
      // Non-JSON stdin is ignored; still preflight cwd.
    }
  }

  const allow = process.env.CONTRIBKIT_ALLOW === "1";
  const { receipt } = await preflight({
    repoPath: cwd,
    baseRef: "HEAD",
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
