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
  return `${lines.join("\n")}\n`;
}

export function explainReceipt(receipt: PreflightReceipt): string {
  return formatReceipt(receipt);
}

export function statusExitCode(status: ReceiptStatus): number {
  return status === "blocked" ? 1 : 0;
}
