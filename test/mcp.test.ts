import { describe, expect, it } from "vitest";
import { handleMcpMessage, MCP_TOOLS } from "../src/mcp.js";
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
});
