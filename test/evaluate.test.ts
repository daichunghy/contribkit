import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import { evaluate, receiptBodyOf } from "../src/evaluate.js";
import { SCHEMA_RECEIPT } from "../src/version.js";
import { assertReceipt } from "../src/schema.js";
import { blockRule, emptySnapshot, makeContract, recorded } from "./helpers.js";

describe("evaluate", () => {
  it("uses block > needs-human > pass precedence", () => {
    const contract = makeContract(
      [
        blockRule({
          id: "issue-link",
          check: "issue_link",
          message: "link an issue",
        }),
      ],
      [],
      [
        blockRule({
          id: "codeowners",
          check: "path_owned",
          severity: "needs-human",
          patterns: ["src/**"],
          message: "owners",
        }),
      ],
    );
    const blocked = evaluate(contract, emptySnapshot());
    expect(blocked.status).toBe("blocked");
    const humanOnly = evaluate(
      makeContract([], [], [
        blockRule({
          id: "codeowners",
          check: "path_owned",
          severity: "needs-human",
          patterns: ["src/**"],
          message: "owners",
        }),
      ]),
      emptySnapshot(),
    );
    expect(humanOnly.status).toBe("needs-human");
    const pass = evaluate(
      makeContract([
        blockRule({
          id: "max-files",
          check: "max_files",
          max: 20,
          message: "split the PR",
        }),
      ]),
      emptySnapshot({ changedPaths: ["a.ts"], diffStat: { files: 1, insertions: 1, deletions: 0 } }),
    );
    expect(pass.status).toBe("pass");
  });

  it("produces byte-identical digested bodies for the same inputs", () => {
    const contract = makeContract([
      blockRule({ id: "issue-link", check: "issue_link", message: "link" }),
    ]);
    const snapshot = emptySnapshot({ prBodyDraft: "hello" });
    const a = evaluate(contract, snapshot, { evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const b = evaluate(contract, snapshot, { evaluatedAt: "2026-08-22T00:00:00.000Z" });
    expect(canonicalJson(receiptBodyOf(a))).toBe(canonicalJson(receiptBodyOf(b)));
    expect(a.digest).toBe(b.digest);
    expect(a.evaluatedAt).not.toBe(b.evaluatedAt);
    expect(a.schema).toBe(SCHEMA_RECEIPT);
    assertReceipt(a);
  });

  it("does not treat PR-body prose as a passing test (T6)", () => {
    const contract = makeContract([
      blockRule({
        id: "test-command",
        check: "command_recorded",
        command: "npm test",
        message: "record npm test",
      }),
    ]);
    const receipt = evaluate(
      contract,
      emptySnapshot({ prBodyDraft: "I ran tests and they passed." }),
    );
    expect(receipt.status).toBe("blocked");
    const passing = evaluate(
      contract,
      emptySnapshot({ recordedCommands: [recorded("npm test", 0)] }),
    );
    expect(passing.status).toBe("pass");
    const nonzero = evaluate(
      contract,
      emptySnapshot({ recordedCommands: [recorded("npm test", 1)] }),
    );
    expect(nonzero.status).toBe("blocked");
  });

  it("treats unknown check types as needs-human failures", () => {
    const contract = makeContract([], [], [
      blockRule({
        id: "mystery",
        check: "unknown_check",
        severity: "needs-human",
        message: "unknown extractor",
      }),
    ]);
    const receipt = evaluate(contract, emptySnapshot());
    expect(receipt.status).toBe("needs-human");
    expect(receipt.findings.some((item) => item.check === "unknown_check" && !item.passed)).toBe(true);
  });

  it("accepts Fixes #N or a GitHub issue URL in body or branch", () => {
    const contract = makeContract([
      blockRule({ id: "issue-link", check: "issue_link", message: "link" }),
    ]);
    expect(evaluate(contract, emptySnapshot({ prBodyDraft: "Fixes #12" })).status).toBe("pass");
    expect(
      evaluate(
        contract,
        emptySnapshot({ prBodyDraft: "see https://github.com/acme/tool/issues/9" }),
      ).status,
    ).toBe("pass");
    expect(evaluate(contract, emptySnapshot({ branchName: "fix/issue-4" })).status).toBe("pass");
  });
});
