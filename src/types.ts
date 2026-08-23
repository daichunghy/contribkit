export type Severity = "block" | "advisory" | "needs-human";
export type ReceiptStatus = "pass" | "blocked" | "needs-human";

export const CHECK_KINDS = [
  "file_exists",
  "pr_body_matches",
  "pr_checkboxes",
  "issue_link",
  "path_owned",
  "max_files",
  "max_diff_lines",
  "forbidden_path",
  "command_recorded",
  "commit_signed_off",
  "unknown_key",
  "unknown_check",
] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

export interface ContractSource {
  path: string;
  digest: string;
}

export interface ContractRule {
  id: string;
  severity: Severity;
  origin: string;
  check: CheckKind;
  message: string;
  path?: string;
  pattern?: string;
  command?: string;
  max?: number;
  glob?: string;
  ignore?: string[];
  patterns?: string[];
  keys?: string[];
}

export interface ContributionContract {
  schema: "contribkit.contract.v1";
  repo?: string;
  ref: string;
  sources: ContractSource[];
  rules: ContractRule[];
  advisory: ContractRule[];
  needsHuman: ContractRule[];
}

export interface DiffStat {
  files: number;
  insertions: number;
  deletions: number;
}

export interface PathDiff {
  path: string;
  insertions: number;
  deletions: number;
}

export interface RecordedCommand {
  command: string;
  exitCode: number;
  source: "executed" | "reported";
  logDigest?: string;
}

export interface EvaluationSnapshot {
  diffStat: DiffStat;
  changedPaths: string[];
  commitMessages: string[];
  prBodyDraft: string;
  recordedCommands: RecordedCommand[];
  gitAuthor: string;
  branchName?: string;
  pathDiffs?: PathDiff[];
}

export interface ReceiptFinding {
  ruleId: string;
  severity: Severity;
  origin: string;
  check: CheckKind;
  message: string;
  passed: boolean;
}

/** Digested body. `evaluatedAt` and `overridden` must not appear here. */
export interface ReceiptBody {
  schema: "contribkit.receipt.v1";
  status: ReceiptStatus;
  contractDigest: string;
  snapshotDigest: string;
  findings: ReceiptFinding[];
}

export interface PreflightReceipt extends ReceiptBody {
  digest: string;
  evaluatedAt: string;
  overridden: boolean;
}

export type AiDisclosureMode = "required" | "advisory" | "off";
export type LicenseMode = "required" | "advisory" | "off";
export type CheckboxMode = "required" | "advisory" | "off";

export interface PolicyTest {
  command?: string;
  record?: boolean;
}

export interface ContribPolicy {
  schema: "contribkit.policy.v1";
  maxFiles?: number;
  maxDiffLines?: number;
  requireIssue?: boolean;
  aiDisclosure?: AiDisclosureMode;
  license?: LicenseMode;
  prCheckboxes?: CheckboxMode;
  test?: PolicyTest;
  ignorePaths?: string[];
  blockAdapters?: string[];
}

export interface PolicyParseResult {
  policy: ContribPolicy | undefined;
  unknownKeys: string[];
  invalid: boolean;
  error?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCheckKind(value: string): value is CheckKind {
  return (CHECK_KINDS as readonly string[]).includes(value);
}

export function allRules(contract: ContributionContract): ContractRule[] {
  return [...contract.rules, ...contract.advisory, ...contract.needsHuman];
}
