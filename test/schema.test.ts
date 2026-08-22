import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { evaluate } from "../src/evaluate.js";
import { assertContract, assertReceipt } from "../src/schema.js";
import { emptySnapshot, makeContract, blockRule, stageFixture } from "./helpers.js";

describe("schemas", () => {
  it("rejects extra keys on a contract", () => {
    const contract = makeContract([
      blockRule({ id: "max-files", check: "max_files", max: 20, message: "split the PR" }),
    ]);
    assertContract(contract);
    expect(() => assertContract({ ...contract, extra: true })).toThrow(/invalid contribkit.contract.v1/);
  });

  it("validates evaluate output", () => {
    const receipt = evaluate(
      makeContract([
        blockRule({ id: "max-files", check: "max_files", max: 20, message: "split the PR" }),
      ]),
      emptySnapshot(),
    );
    assertReceipt(receipt);
  });

  it("compiled fixtures match the contract schema", async () => {
    const repo = await stageFixture("missing-issue");
    const contract = await compile({ repoPath: repo });
    assertContract(contract);
  });
});
