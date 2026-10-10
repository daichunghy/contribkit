import { digestCanonical } from "./canonical.js";
import { receiptBodyOf } from "./evaluate.js";
import type { PreflightReceipt } from "./types.js";

/** SHA-256 detects accidental edits; it is NOT a signature or provenance proof. */
export function verifyReceiptDigest(receipt: PreflightReceipt): void {
  if (digestCanonical(receiptBodyOf(receipt)) !== receipt.digest) {
    throw new Error("receipt digest mismatch: this file has changed since evaluation");
  }
}
