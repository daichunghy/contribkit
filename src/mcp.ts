#!/usr/bin/env node
import { explainReceipt } from "./explain.js";
import { compile } from "./compile.js";
import { canonicalJson } from "./canonical.js";
import { preflight } from "./preflight.js";
import { assertReceipt } from "./schema.js";
import { isRecord, type RecordedCommand } from "./types.js";
import { VERSION } from "./version.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

function toolError(code: string, message: string): { error: { code: string; message: string } } {
  const clean = message.split("\n")[0] ?? message;
  return { error: { code, message: clean } };
}

function textResult(value: unknown, isError = false): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const payload = { content: [{ type: "text" as const, text: canonicalJson(value) }] };
  return isError ? { ...payload, isError: true } : payload;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordedCommandsOf(value: unknown): RecordedCommand[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RecordedCommand[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.command !== "string" || typeof item.exitCode !== "number") continue;
    const entry: RecordedCommand = { command: item.command, exitCode: item.exitCode, source: "reported" };
    if (typeof item.logDigest === "string") entry.logDigest = item.logDigest;
    out.push(entry);
  }
  return out;
}

export const MCP_TOOLS = [
  {
    name: "compile_contract",
    description: "Compile a contribution contract from a local git repository root.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repoPath: { type: "string" },
        ref: { type: "string" },
      },
      required: ["repoPath"],
    },
  },
  {
    name: "preflight_diff",
    description: "Evaluate a local diff against the compiled contract. Does not open a pull request.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repoPath: { type: "string" },
        baseRef: { type: "string" },
        prBodyDraft: { type: "string" },
        recordedCommands: {
          type: "array",
          items: {
            type: "object",
            properties: {
              command: { type: "string" },
              exitCode: { type: "number" },
              logDigest: { type: "string" },
            },
            required: ["command", "exitCode"],
          },
        },
      },
      required: ["repoPath", "baseRef"],
    },
  },
  {
    name: "explain_receipt",
    description: "Turn a contribkit receipt JSON object into human text.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        receipt: { type: "object" },
      },
      required: ["receipt"],
    },
  },
] as const;

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "compile_contract") {
      const repoPath = asString(args.repoPath);
      if (repoPath === undefined) return textResult(toolError("INVALID_ARGS", "repoPath is required"), true);
      const ref = asString(args.ref);
      const contract = await compile(ref === undefined ? { repoPath } : { repoPath, ref });
      return textResult(contract);
    }
    if (name === "preflight_diff") {
      const repoPath = asString(args.repoPath);
      const baseRef = asString(args.baseRef);
      if (repoPath === undefined || baseRef === undefined) {
        return textResult(toolError("INVALID_ARGS", "repoPath and baseRef are required"), true);
      }
      const recorded = recordedCommandsOf(args.recordedCommands);
      const prBodyDraft = asString(args.prBodyDraft);
      const { receipt } = await preflight({
        repoPath,
        baseRef,
        ...(prBodyDraft !== undefined ? { prBodyDraft } : {}),
        ...(recorded !== undefined ? { recordedCommands: recorded } : {}),
      });
      return textResult(receipt);
    }
    if (name === "explain_receipt") {
      if (!isRecord(args.receipt)) return textResult(toolError("INVALID_ARGS", "receipt is required"), true);
      assertReceipt(args.receipt);
      return textResult({ text: explainReceipt(args.receipt) });
    }
    return textResult(toolError("UNKNOWN_TOOL", `unknown tool: ${name}`), true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool failed";
    return textResult(toolError("TOOL_FAILED", message), true);
  }
}

export async function handleMcpMessage(message: unknown): Promise<Record<string, unknown> | undefined> {
  if (!isRecord(message)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } };
  }
  const req = message as JsonRpcRequest;
  const id = req.id ?? null;
  if (req.method === "notifications/initialized" || req.method === "notifications/cancelled") {
    return undefined;
  }
  if (req.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "contribkit", version: VERSION },
      },
    };
  }
  if (req.method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (req.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }
  if (req.method === "tools/call") {
    const params = isRecord(req.params) ? req.params : {};
    const name = asString(params.name);
    const args = isRecord(params.arguments) ? params.arguments : {};
    if (name === undefined) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "name is required" } };
    }
    const result = await callTool(name, args);
    return { jsonrpc: "2.0", id, result };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${String(req.method)}` } };
}

export async function runMcpStdio(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
    if (buffer.length > 4_000_000) {
      throw new Error("MCP input exceeds the 4 MB frame buffer limit.");
    }
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (lengthMatch === null || lengthMatch[1] === undefined) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(lengthMatch[1], 10);
      if (!Number.isSafeInteger(length) || length < 0 || length > 1_000_000) {
        throw new Error("MCP Content-Length exceeds the 1 MB frame limit.");
      }
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) break;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        continue;
      }
      const response = await handleMcpMessage(parsed);
      if (response === undefined) continue;
      const payload = Buffer.from(`${canonicalJson(response)}\n`, "utf8");
      output.write(`Content-Length: ${payload.length}\r\n\r\n`);
      output.write(payload);
    }
  }
}

function isDirectRun(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  return argv1.includes("mcp");
}

if (isDirectRun()) {
  runMcpStdio().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  });
}
