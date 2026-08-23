import { compareTextUnit, digestCanonical } from "./canonical.js";
import { commandsEquivalent } from "./allowlist.js";
import { ownedPaths } from "./codeowners.js";
import { matchGlob, pathIgnored } from "./glob.js";
import { isCheckKind, type CheckKind, type ContractRule, type ContributionContract } from "./types.js";
import type {
  EvaluationSnapshot,
  PreflightReceipt,
  ReceiptBody,
  ReceiptFinding,
  ReceiptStatus,
  Severity,
} from "./types.js";
import { SCHEMA_RECEIPT } from "./version.js";

const ISSUE_INLINE = /(fixes|closes|resolves)\s+#\d+/i;
const ISSUE_URL = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/i;
const ISSUE_BRANCH = /#\d+|issues?[-_/]?\d+/i;
const SIGNED_OFF = /^Signed-off-by:\s+\S+/m;

export function hasIssueLink(body: string, branch: string | undefined): boolean {
  if (ISSUE_INLINE.test(body) || ISSUE_URL.test(body)) return true;
  if (branch !== undefined && (ISSUE_INLINE.test(branch) || ISSUE_URL.test(branch) || ISSUE_BRANCH.test(branch))) {
    return true;
  }
  return false;
}

function checkboxChecked(body: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const checked = new RegExp(`^\\s*[-*]\\s+\\[[xX]\\]\\s+${escaped}\\s*$`, "im");
  return checked.test(body);
}

function filteredPaths(snapshot: EvaluationSnapshot, ignore: readonly string[] | undefined): string[] {
  return snapshot.changedPaths.filter((path) => !pathIgnored(path, ignore));
}

function filteredLineCount(snapshot: EvaluationSnapshot, ignore: readonly string[] | undefined): number {
  if (snapshot.pathDiffs && snapshot.pathDiffs.length > 0) {
    let lines = 0;
    for (const row of snapshot.pathDiffs) {
      if (pathIgnored(row.path, ignore)) continue;
      lines += row.insertions + row.deletions;
    }
    return lines;
  }
  return snapshot.diffStat.insertions + snapshot.diffStat.deletions;
}

function lastCommit(snapshot: EvaluationSnapshot): string {
  const last = snapshot.commitMessages[snapshot.commitMessages.length - 1];
  return last ?? "";
}

function hasContribution(snapshot: EvaluationSnapshot, ignore?: readonly string[]): boolean {
  return filteredPaths(snapshot, ignore).length > 0;
}

function checkPasses(rule: ContractRule, snapshot: EvaluationSnapshot): boolean {
  switch (rule.check) {
    case "file_exists":
      return false;
    case "unknown_key":
    case "unknown_check":
      return false;
    case "pr_body_matches": {
      if (!hasContribution(snapshot, rule.ignore)) return true;
      const pattern = rule.pattern;
      if (pattern === undefined) return false;
      const regex = new RegExp(pattern, "i");
      const haystack = `${snapshot.prBodyDraft}\n${snapshot.branchName ?? ""}`;
      return regex.test(haystack);
    }
    case "issue_link":
      if (!hasContribution(snapshot, rule.ignore)) return true;
      return hasIssueLink(snapshot.prBodyDraft, snapshot.branchName);
    case "pr_checkboxes": {
      if (!hasContribution(snapshot, rule.ignore)) return true;
      const label = rule.pattern;
      if (label === undefined) return false;
      return checkboxChecked(snapshot.prBodyDraft, label);
    }
    case "path_owned": {
      const patterns = rule.patterns ?? (rule.glob !== undefined ? [rule.glob] : []);
      const ignore = rule.ignore;
      const changed = filteredPaths(snapshot, ignore);
      if (patterns.length === 0) return true;
      const synthetic = patterns.map((pattern, index) => ({
        pattern,
        owners: ["@owners"],
        line: index + 1,
      }));
      return ownedPaths(synthetic, changed).length === 0;
    }
    case "max_files": {
      const max = rule.max;
      if (max === undefined) return false;
      return filteredPaths(snapshot, rule.ignore).length <= max;
    }
    case "max_diff_lines": {
      const max = rule.max;
      if (max === undefined) return false;
      return filteredLineCount(snapshot, rule.ignore) <= max;
    }
    case "forbidden_path": {
      const glob = rule.glob ?? ".github/workflows/**";
      const changed = filteredPaths(snapshot, rule.ignore);
      return !changed.some((path) => matchGlob(glob, path));
    }
    case "command_recorded": {
      if (!hasContribution(snapshot, rule.ignore)) return true;
      const required = rule.command;
      if (required === undefined) return false;
      return snapshot.recordedCommands.some(
        (recorded) => recorded.source === "executed" && recorded.exitCode === 0 && commandsEquivalent(recorded.command, required),
      );
    }
    case "commit_signed_off":
      if (!hasContribution(snapshot, rule.ignore)) return true;
      return SIGNED_OFF.test(lastCommit(snapshot));
    default: {
      const _exhaustive: never = rule.check;
      return _exhaustive;
    }
  }
}

function findingFor(rule: ContractRule, snapshot: EvaluationSnapshot): ReceiptFinding {
  if (!isCheckKind(rule.check) || rule.check === "unknown_check") {
    const finding: ReceiptFinding = {
      ruleId: rule.id,
      severity: "needs-human",
      origin: rule.origin,
      check: "unknown_check",
      message: rule.message,
      passed: false,
    };
    return finding;
  }
  const passed = checkPasses(rule, snapshot);
  const finding: ReceiptFinding = {
    ruleId: rule.id,
    severity: rule.severity,
    origin: rule.origin,
    check: rule.check,
    message: rule.message,
    passed,
  };
  return finding;
}

function decideStatus(findings: readonly ReceiptFinding[]): ReceiptStatus {
  const failed = findings.filter((item) => !item.passed);
  if (failed.some((item) => item.severity === "block")) return "blocked";
  if (failed.some((item) => item.severity === "needs-human")) return "needs-human";
  return "pass";
}

function sortFindings(findings: ReceiptFinding[]): ReceiptFinding[] {
  return [...findings].sort((left, right) => {
    const byId = compareTextUnit(left.ruleId, right.ruleId);
    if (byId !== 0) return byId;
    return compareTextUnit(left.origin, right.origin);
  });
}

export function receiptBodyOf(receipt: PreflightReceipt): ReceiptBody {
  return {
    schema: receipt.schema,
    status: receipt.status,
    contractDigest: receipt.contractDigest,
    snapshotDigest: receipt.snapshotDigest,
    findings: receipt.findings,
  };
}

export function evaluate(
  contract: ContributionContract,
  snapshot: EvaluationSnapshot,
  options: { overridden?: boolean; evaluatedAt?: string } = {},
): PreflightReceipt {
  const collected: ReceiptFinding[] = [];
  for (const rule of [...contract.rules, ...contract.advisory, ...contract.needsHuman]) {
    collected.push(findingFor(rule, snapshot));
  }
  const findings = sortFindings(collected);
  const status = decideStatus(findings);
  const body: ReceiptBody = {
    schema: SCHEMA_RECEIPT,
    status,
    contractDigest: digestCanonical(contract),
    snapshotDigest: digestCanonical(snapshot),
    findings,
  };
  const receipt: PreflightReceipt = {
    ...body,
    digest: digestCanonical(body),
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    overridden: options.overridden === true,
  };
  return receipt;
}

export type { CheckKind, Severity };
