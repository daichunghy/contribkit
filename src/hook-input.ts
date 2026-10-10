import { isRecord } from "./types.js";

export type HookTarget =
  | { action: "ignore" }
  | { action: "invalid"; reason: string }
  | { action: "guard"; body?: string; bodyFile?: string; requestedBase?: string };

function shellTokens(command: string, powerShell = false): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;
  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };
  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && !powerShell && quote !== "'") {
      escaping = true;
      continue;
    }
    if (char === "'" || char === '"') {
      if (!quote) {
        quote = char;
        continue;
      }
      if (quote === char) {
        quote = undefined;
        continue;
      }
    }
    if (!quote && /[\s;&|]/.test(char)) {
      flush();
      if (char === ";" || char === "&" || char === "|" || char === "\n") {
        tokens.push(";");
      }
      continue;
    }
    current += char;
  }
  if (quote || escaping) return undefined;
  flush();
  return tokens;
}

function prInvocationStart(tokens: readonly string[]): number {
  for (let i = 0; i + 2 < tokens.length; i += 1) {
    const executable = (tokens[i] ?? "").replace(/\\/g, "/").split("/").pop()?.toLowerCase();
    const sub = tokens[i + 1]?.toLowerCase();
    const action = tokens[i + 2]?.toLowerCase();
    if ((executable === "gh" || executable === "gh.exe") && sub === "pr" && action === "create") return i;
    if ((executable === "glab" || executable === "glab.exe") && sub === "mr" && action === "create") return i;
  }
  return -1;
}

/**
 * Classify PreToolUse invocations without running shell code.
 * Only a PR-creation command should trigger a potentially expensive preflight.
 */
export function classifyHookInput(payload: unknown): HookTarget {
  if (!isRecord(payload)) return { action: "invalid", reason: "missing hook input" };
  const tool = payload.tool_name;
  if (typeof tool !== "string") return { action: "invalid", reason: "missing tool_name" };
  const nested = isRecord(payload.tool_input) ? payload.tool_input : {};

  if (/^mcp__.+__create_pull_request$/.test(tool)) {
    const body = typeof nested.body === "string" ? nested.body : undefined;
    const base = typeof nested.base_branch === "string" ? nested.base_branch
      : typeof nested.base === "string" ? nested.base : undefined;
    return {
      action: "guard",
      ...(body !== undefined ? { body } : {}),
      ...(base !== undefined ? { requestedBase: base } : {}),
    };
  }
  if (tool !== "Bash" && tool !== "PowerShell") return { action: "ignore" };
  if (typeof nested.command !== "string") {
    return { action: "invalid", reason: "missing shell command" };
  }
  const tokens = shellTokens(nested.command, tool === "PowerShell");
  if (!tokens) {
    // Fail closed for a likely PR command with malformed quoting.
    return /\b(?:gh|glab)(?:\.exe)?\s+(?:pr|mr)\s+create\b/i.test(nested.command)
      ? { action: "invalid", reason: "cannot parse PR command safely" }
      : { action: "ignore" };
  }
  const start = prInvocationStart(tokens);
  if (start < 0) return { action: "ignore" };
  let body: string | undefined;
  let bodyFile: string | undefined;
  let requestedBase: string | undefined;
  for (let i = start + 3; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === ";" || token === undefined) break;
    for (const [longFlag, shortFlag] of [
      ["--body", "-b"],
      ["--body-file", "-F"],
      ["--base", "-B"],
    ] as const) {
      const exact = token === longFlag || token === shortFlag;
      const equals = token.startsWith(longFlag + "=");
      if (!exact && !equals) continue;
      const next = equals ? token.slice(longFlag.length + 1) : tokens[++i];
      if (!next || next === ";") {
        return { action: "invalid", reason: "missing value for " + longFlag };
      }
      if (longFlag === "--body") body = next;
      else if (longFlag === "--body-file") bodyFile = next;
      else requestedBase = next;
      break;
    }
  }
  if (body !== undefined && bodyFile !== undefined) {
    return { action: "invalid", reason: "PR command contains both --body and --body-file" };
  }
  return {
    action: "guard",
    ...(body !== undefined ? { body } : {}),
    ...(bodyFile !== undefined ? { bodyFile } : {}),
    ...(requestedBase !== undefined ? { requestedBase } : {}),
  };
}

/** A GitHub PR base is a branch name on the remote, not the contributor HEAD. */
export function remoteBaseRef(requested: string): string {
  if (requested.startsWith("refs/") || requested.startsWith("origin/")) return requested;
  return "origin/" + requested;
}
