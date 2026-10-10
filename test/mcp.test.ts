import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { handleMcpMessage, MCP_TOOLS, runMcpStdio } from "../src/mcp.js";
import { isRecord } from "../src/types.js";
import { stageFixture } from "./helpers.js";

describe("MCP", () => {
  it("lists the three spec tools", () => {
    expect(MCP_TOOLS.map((tool) => tool.name).sort()).toEqual([
      "compile_contract",
      "explain_receipt",
      "preflight_diff",
    ]);
  });

  it("initialize and tools/list", async () => {
    const init = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(init?.result).toBeDefined();
    const listed = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = listed?.result;
    expect(isRecord(result) && Array.isArray(result.tools)).toBe(true);
  });

  it("compile_contract and preflight_diff against missing-issue", async () => {
    const repo = await stageFixture("missing-issue");
    const compiled = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "compile_contract", arguments: { repoPath: repo } },
    });
    expect(isRecord(compiled?.result)).toBe(true);
    const preflighted = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "preflight_diff", arguments: { repoPath: repo, baseRef: "HEAD" } },
    });
    const body = preflighted?.result;
    expect(isRecord(body) && Array.isArray(body.content)).toBe(true);
    const text = isRecord(body) && Array.isArray(body.content) && isRecord(body.content[0])
      ? String(body.content[0].text)
      : "";
    expect(text).toMatch(/"status":"blocked"/);
    expect(text).toMatch(/issue-link/);
  });

  it("unknown tool returns structured error without a stack", async () => {
    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "explode", arguments: {} },
    });
    const text = JSON.stringify(response);
    expect(text).toMatch(/UNKNOWN_TOOL/);
    expect(text).not.toMatch(/at \w+/);
  });
  it("uses newline-delimited stdio framing even across split chunks", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let responseText = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => { responseText += chunk; });

    const running = runMcpStdio(input, output);
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/');
    input.write('list"}\r\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.end();
    await running;

    const lines = responseText.trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0] ?? "") as { id: number; result: { protocolVersion: string } };
    const second = JSON.parse(lines[1] ?? "") as { id: number; result: { tools: unknown[] } };
    expect(first.id).toBe(1);
    expect(first.result.protocolVersion).toBe("2025-11-25");
    expect(second.id).toBe(2);
    expect(second.result.tools).toHaveLength(3);
    expect(responseText).not.toContain("Content-Length");
  });

  it("reports malformed JSON without exposing the offending input", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => { text += chunk; });
    const running = runMcpStdio(input, output);
    input.end('{"invalid":\n');
    await running;
    const response = JSON.parse(text) as { error: { code: number; message: string }; id: null };
    expect(response.error.code).toBe(-32700);
    expect(response.error.message).toBe("parse error");
    expect(response.id).toBeNull();
  });

  it("rejects oversized partial frames without executing a request", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const running = runMcpStdio(input, output);
    input.end("x".repeat(1_000_001));
    await expect(running).rejects.toThrow(/1 MB line limit/);
  });

  it("rejects a schema-valid but tampered receipt in explain_receipt", async () => {
    const compiled = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "explain_receipt",
        arguments: {
          receipt: {
            schema: "contribkit.receipt.v1",
            status: "pass",
            contractDigest: "sha256:" + "0".repeat(64),
            snapshotDigest: "sha256:" + "0".repeat(64),
            findings: [],
            digest: "sha256:" + "0".repeat(64),
            evaluatedAt: "2026-10-10T00:00:00.000Z",
            overridden: false,
          },
        },
      },
    });
    expect(JSON.stringify(compiled)).toMatch(/receipt digest mismatch/);
    expect(JSON.stringify(compiled)).toMatch(/"isError":true/);
  });

  it("autodiscovers a trusted base for MCP without requiring the ref argument", async () => {
    const repo = await stageFixture("missing-issue");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const git = promisify(execFile);
    const sha = (await git("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await git("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd: repo });
    const result = await handleMcpMessage({
      jsonrpc: "2.0", id: 20, method: "tools/call",
      params: { name: "preflight_diff", arguments: { repoPath: repo } },
    });
    expect(JSON.stringify(result)).toMatch(/blocked/);
    expect(JSON.stringify(result)).toMatch(/issue-link/);
  });

});
