import type { Flag } from "@/lib/api";

export type FlagRuleValue = "flag" | "reject" | "approve";
export type FlagRules = Record<string, FlagRuleValue>;

const HARDCODED_REJECT_SUBCATEGORY =
  "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)";

/**
 * Mirrors the precedence in backend/pipeline/nodes/decision.py so the UI can predict
 * what a run's decision would be under the current Settings rules: Reject > Flag > Approve.
 */
export function computeEscalatedDecision(
  flags: Flag[],
  rules: FlagRules
): "approve" | "flag" | "reject" {
  if (flags.some((f) => f.subcategory === HARDCODED_REJECT_SUBCATEGORY)) return "reject";
  if (flags.length === 0) return "approve";
  if (flags.some((f) => rules[f.subcategory] === "reject")) return "reject";
  if (flags.every((f) => rules[f.subcategory] === "approve")) return "approve";
  return "flag";
}

export function stripPdfExtension(filename: string | null | undefined): string {
  if (!filename) return "Invoice";
  return filename.replace(/\.pdf$/i, "");
}