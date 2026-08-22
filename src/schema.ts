import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { isRecord, type ContribPolicy, type ContributionContract, type PreflightReceipt } from "./types.js";

function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    try {
      const pkg = join(dir, "package.json");
      const schemas = join(dir, "schemas");
      readFileSync(pkg);
      readFileSync(join(schemas, "contract.v1.json"));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("contribkit: cannot locate package root (package.json + schemas/)");
}

const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });

function loadValidator(name: string): ValidateFunction {
  const raw = readFileSync(join(packageRoot(), "schemas", name), "utf8");
  const schema: unknown = JSON.parse(raw);
  if (!isRecord(schema) && !Array.isArray(schema)) {
    throw new Error(`contribkit: schema ${name} is not a JSON object`);
  }
  return ajv.compile(schema as AnySchema);
}

const contractValidator = loadValidator("contract.v1.json");
const receiptValidator = loadValidator("receipt.v1.json");
const policyValidator = loadValidator("policy.v1.json");

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return "unknown schema error";
  return errors
    .map((err) => {
      const path = err.instancePath === "" ? "/" : err.instancePath;
      return `${path} ${err.message ?? "invalid"}`;
    })
    .join("; ");
}

export function assertContract(value: unknown): asserts value is ContributionContract {
  if (!contractValidator(value)) {
    throw new Error(`invalid contribkit.contract.v1: ${formatAjvErrors(contractValidator.errors)}`);
  }
}

export function assertReceipt(value: unknown): asserts value is PreflightReceipt {
  if (!receiptValidator(value)) {
    throw new Error(`invalid contribkit.receipt.v1: ${formatAjvErrors(receiptValidator.errors)}`);
  }
}

export function policySchemaErrors(value: unknown): string | undefined {
  if (policyValidator(value)) return undefined;
  return formatAjvErrors(policyValidator.errors);
}

export function isValidPolicy(value: unknown): value is ContribPolicy {
  return policyValidator(value) === true;
}
