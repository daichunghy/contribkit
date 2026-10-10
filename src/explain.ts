import type { PreflightReceipt, ReceiptFinding, ReceiptStatus } from "./types.js";

function section(title: string, rows: readonly ReceiptFinding[]): string[] {
  if (rows.length === 0) return [];
  const lines = [`${title}:`];
  for (const row of rows) {
    lines.push(`  - ${row.ruleId} (${row.origin}): ${row.message}`);
  }
  return lines;
}

export function formatReceipt(receipt: PreflightReceipt): string {
  const failed = receipt.findings.filter((item) => !item.passed);
  const blocked = failed.filter((item) => item.severity === "block");
  const human = failed.filter((item) => item.severity === "needs-human");
  const advisory = failed.filter((item) => item.severity === "advisory");
  const lines = [
    `contribkit ${receipt.status}`,
    `digest ${receipt.digest}`,
  ];
  if (receipt.overridden) lines.push("overridden true");
  lines.push(...section("blocked", blocked));
  lines.push(...section("needs-human", human));
  lines.push(...section("advisory", advisory));
  if (failed.length === 0) lines.push("all contract checks passed");
  else {
    const actions: string[] = [];
    if (blocked.some((row) => row.ruleId === "issue-link")) {
      actions.push("Add a real issue reference in the PR body, for example Fixes #123.");
    }
    if (blocked.some((row) => row.check === "command_recorded")) {
      actions.push("Run trusted tests separately, or explicitly opt in with --run-tests.");
    }
    if (blocked.some((row) => row.check === "pr_checkboxes") || advisory.some((row) => row.check === "pr_checkboxes")) {
      actions.push("Complete the pull request checklist in --body-file FILE.");
    }
    if (human.length > 0) {
      actions.push("Ask a maintainer to review the needs-human findings; the receipt is not an approval.");
    }
    if (actions.length > 0) lines.push("next steps:", ...actions.map((item) => "  - " + item));
  }
  lines.splice(2, 0,
    "summary " + blocked.length + " blocker(s), " + human.length +
    " human review(s), " + advisory.length + " advisory finding(s)");
  return `${lines.join("\n")}\n`;
}

export function explainReceipt(receipt: PreflightReceipt): string {
  return formatReceipt(receipt);
}

export function statusExitCode(status: ReceiptStatus, strict = false): number {
  if (status === "blocked") return 1;
  if (strict && status === "needs-human") return 3;
  return 0;
}
