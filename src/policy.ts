import { parse } from "yaml";
import { isValidPolicy, policySchemaErrors } from "./schema.js";
import { isRecord, type ContribPolicy, type PolicyParseResult } from "./types.js";

const POLICY_KEYS = new Set([
  "schema",
  "maxFiles",
  "maxDiffLines",
  "requireIssue",
  "aiDisclosure",
  "license",
  "prCheckboxes",
  "test",
  "ignorePaths",
  "blockAdapters",
]);

const TEST_KEYS = new Set(["command", "record"]);

function collectUnknown(record: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(record)) {
    if (!POLICY_KEYS.has(key)) keys.push(key);
  }
  const test = record.test;
  if (isRecord(test)) {
    for (const key of Object.keys(test)) {
      if (!TEST_KEYS.has(key)) keys.push(`test.${key}`);
    }
  }
  return keys;
}

function pickKnown(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (!POLICY_KEYS.has(key)) continue;
    if (key === "test" && isRecord(record.test)) {
      const test: Record<string, unknown> = {};
      for (const inner of Object.keys(record.test)) {
        if (TEST_KEYS.has(inner)) test[inner] = record.test[inner];
      }
      out.test = test;
    } else {
      out[key] = record[key];
    }
  }
  return out;
}

export function parsePolicyYaml(text: string): PolicyParseResult {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "yaml parse error";
    return { policy: undefined, unknownKeys: [], invalid: true, error: message };
  }
  if (parsed === undefined || parsed === null) {
    return { policy: undefined, unknownKeys: [], invalid: true, error: "empty policy" };
  }
  if (!isRecord(parsed)) {
    return { policy: undefined, unknownKeys: [], invalid: true, error: "policy is not a mapping" };
  }
  const unknownKeys = collectUnknown(parsed);
  const known = pickKnown(parsed);
  if (known.schema === undefined) {
    known.schema = "contribkit.policy.v1";
  }
  if (!isValidPolicy(known)) {
    return {
      policy: undefined,
      unknownKeys,
      invalid: true,
      error: policySchemaErrors(known) ?? "policy failed schema validation",
    };
  }
  return { policy: known, unknownKeys, invalid: false };
}
