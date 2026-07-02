"""
Stage 3 — Matching

Four independent sub-checks, all executed unconditionally (except 3c which requires
a matched PO). Results are accumulated into all_flags and reasoning_trail.

  3a. PO Matching  — explicit lookup or implicit vendor/amount/line-item inference
  3b. Vendor Check — approved vendor list lookup
  3c. Amount Comparison — tiered asymmetric tolerance, deterministic explanation check
  3d. Duplicate Detection — exact and fuzzy, 60-day window

Key design constraints from phase_1.md:
  - Implicit matches NEVER result in approve (all implicit paths always flag)
  - Reject is ONLY triggered by 3c: unexplained overage beyond 3× tolerance cap
  - Explanation check is deterministic (line-item math), no LLM judgment
  - Unapproved vendor alone never triggers reject
  - Duplicates always flag, never auto-reject
"""

from __future__ import annotations

from datetime import datetime, timedelta

from pipeline.models import InvoiceExtraction, LineItem
from pipeline.state import PipelineState
from pipeline.utils.tolerance import check_amount_tolerance


# ── Public node ───────────────────────────────────────────────────────────────

def matching_node(state: PipelineState) -> dict:
    """
    Stage 3 node: PO matching, vendor check, amount comparison, duplicate detection.

    Returns state updates for:
        matched_po_number
        match_type
        reasoning_trail (new entries only)
        all_flags (new entries only)
    """
    extracted = InvoiceExtraction(**state["extracted_data"])
    po_dataset = state["po_dataset"]
    approved_vendors = state["approved_vendors"]
    invoice_history = state["invoice_history"]
    reference_date = datetime.strptime(state["reference_date"], "%Y-%m-%d").date()

    flags: list[dict] = []
    reasoning: list[str] = []
    matched_po_number: str | None = None
    match_type: str = "none"
    matched_po_record: dict | None = None

    # ── 3a: PO Matching ───────────────────────────────────────────────────────
    if extracted.po_reference:
        # Explicit PO reference — direct lookup
        matched_po_record = next(
            (po for po in po_dataset if po.get("po_number") == extracted.po_reference),
            None,
        )
        if matched_po_record:
            matched_po_number = matched_po_record["po_number"]
            match_type = "explicit"
            reasoning.append(
                f"Stage 3a (PO Match): Explicit PO reference '{extracted.po_reference}' "
                f"found in dataset → matched to {matched_po_number}."
            )
        else:
            match_type = "not_found"
            flags.append({
                "category": "PO Matching",
                "subcategory": "Referenced PO Not Found",
                "flag_confidence": "high",
                "detail": (
                    f"Invoice explicitly references PO '{extracted.po_reference}', "
                    f"but no matching record exists in the PO dataset."
                ),
            })
            reasoning.append(
                f"Stage 3a (PO Match): Explicit PO reference '{extracted.po_reference}' "
                f"NOT found in dataset → flag 'Referenced PO Not Found'."
            )
    else:
        # No explicit PO reference — Edge Case D: implicit matching
        reasoning.append(
            "Stage 3a (PO Match): No explicit PO reference on invoice. "
            "Attempting implicit match by vendor name, total, and line items (Edge Case D)."
        )
        matched_po_record, match_type, implicit_flag = _implicit_po_match(
            extracted, po_dataset
        )
        if implicit_flag:
            flags.append(implicit_flag)
            matched_po_number = matched_po_record["po_number"] if matched_po_record else None
            reasoning.append(
                f"Stage 3a (PO Match): Implicit match result — {match_type}, "
                f"matched PO: {matched_po_number}."
            )
        else:
            # No plausible PO found
            match_type = "no_match"
            flags.append({
                "category": "PO Matching",
                "subcategory": "No Matching PO Found",
                "flag_confidence": "high",
                "detail": (
                    f"No PO found for vendor '{extracted.vendor_name}' "
                    f"in the PO dataset."
                ),
            })
            reasoning.append(
                f"Stage 3a (PO Match): No PO found for vendor "
                f"'{extracted.vendor_name}' → flag 'No Matching PO Found'."
            )

    # ── 3b: Vendor Check ──────────────────────────────────────────────────────
    vendor_normalized = _normalize(extracted.vendor_name or "")
    vendor_approved = any(
        _normalize(v.get("vendor_name", "")) == vendor_normalized
        and v.get("approved", False)
        for v in approved_vendors
    )

    if not vendor_approved:
        flags.append({
            "category": "Vendor Validation",
            "subcategory": "Unapproved Vendor",
            "flag_confidence": "high",
            "detail": (
                f"Vendor '{extracted.vendor_name}' is not on the approved vendor list. "
                "Unapproved vendor alone does not trigger reject — human review required."
            ),
        })
        reasoning.append(
            f"Stage 3b (Vendor): '{extracted.vendor_name}' is NOT on the approved vendor list."
        )
    else:
        reasoning.append(
            f"Stage 3b (Vendor): '{extracted.vendor_name}' is on the approved vendor list."
        )

    # ── 3c: Amount Comparison ─────────────────────────────────────────────────
    if matched_po_record is not None and extracted.total is not None:
        po_total = matched_po_record["po_total"]
        invoice_total = extracted.total
        result = check_amount_tolerance(invoice_total, po_total)

        if result["within_tolerance"]:
            reasoning.append(
                f"Stage 3c (Amount): Invoice {invoice_total:.2f} vs PO {po_total:.2f} — "
                f"delta {result['delta']:+.2f} is within {result['direction']} tolerance "
                f"({result['tolerance']:.2f}) for {result['tier']} tier. No flag."
            )
        else:
            # Outside tolerance — run deterministic explanation check (Edge Case E)
            extra_items = _find_extra_line_items(extracted, matched_po_record)
            extra_total = sum(item.quantity * item.unit_price for item in extra_items)
            delta = result["delta"]
            abs_delta = abs(delta)

            is_explained = (
                extra_total > 0.0
                and abs((po_total + extra_total) - invoice_total) < 0.02
            )

            if is_explained:
                extra_desc = "; ".join(
                    f"{item.description} ({item.quantity}×${item.unit_price:.2f})"
                    for item in extra_items
                )
                flags.append({
                    "category": "Amount Discrepancy",
                    "subcategory": "Explained Overage",
                    "flag_confidence": "medium",
                    "detail": (
                        f"Invoice total {invoice_total:.2f} exceeds PO total {po_total:.2f} "
                        f"by {delta:+.2f} (outside {result['tier']} tier tolerance "
                        f"of {result['tolerance']:.2f}). "
                        f"Delta is fully explained by extra line item(s) not on PO: "
                        f"[{extra_desc}] totaling {extra_total:.2f}. "
                        "Explained overage never triggers reject."
                    ),
                })
                reasoning.append(
                    f"Stage 3c (Amount): Delta {delta:+.2f} exceeds tolerance "
                    f"{result['tolerance']:.2f} but is fully explained by extra "
                    f"line item(s) ({extra_desc}) → Explained Overage flag."
                )

            elif result["beyond_three_x"]:
                # REJECT TRIGGER — the only reject path in the entire pipeline
                flags.append({
                    "category": "Amount Discrepancy",
                    "subcategory": "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)",
                    "flag_confidence": "high",
                    "detail": (
                        f"Invoice total {invoice_total:.2f} vs PO total {po_total:.2f}: "
                        f"delta {delta:+.2f}, "
                        f"tolerance {result['tolerance']:.2f} ({result['tier']} tier), "
                        f"3× cap {result['three_x_cap']:.2f}. "
                        f"Delta exceeds 3× cap by "
                        f"{abs_delta - result['three_x_cap']:.2f}. "
                        "No line-item explanation found. REJECT TRIGGER."
                    ),
                })
                reasoning.append(
                    f"Stage 3c (Amount): REJECT TRIGGER — delta {delta:+.2f} is unexplained "
                    f"and exceeds 3× tolerance cap {result['three_x_cap']:.2f}."
                )

            else:
                # Unexplained but within 3× cap — flag only
                flags.append({
                    "category": "Amount Discrepancy",
                    "subcategory": "Unexplained Overage",
                    "flag_confidence": "medium",
                    "detail": (
                        f"Invoice total {invoice_total:.2f} vs PO total {po_total:.2f}: "
                        f"delta {delta:+.2f}, outside tolerance {result['tolerance']:.2f} "
                        f"but within 3× cap {result['three_x_cap']:.2f}. "
                        "No line-item explanation found."
                    ),
                })
                reasoning.append(
                    f"Stage 3c (Amount): Delta {delta:+.2f} is unexplained and outside "
                    f"tolerance {result['tolerance']:.2f} but within 3× cap "
                    f"{result['three_x_cap']:.2f} → Unexplained Overage flag."
                )
    else:
        reason = (
            "no matched PO" if matched_po_record is None else "invoice total is null"
        )
        reasoning.append(f"Stage 3c (Amount): Skipped — {reason}.")

    # ── 3d: Duplicate Detection ───────────────────────────────────────────────
    dup_flag = _check_duplicate(extracted, invoice_history, reference_date)
    if dup_flag:
        flags.append(dup_flag)
        reasoning.append(
            f"Stage 3d (Duplicate): DUPLICATE DETECTED — {dup_flag['subcategory']}."
        )
    else:
        reasoning.append(
            "Stage 3d (Duplicate): No duplicate found in 60-day window."
        )

    return {
        "matched_po_number": matched_po_number,
        "match_type": match_type,
        "reasoning_trail": reasoning,
        "all_flags": flags,
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _normalize(name: str) -> str:
    """Normalize vendor name for comparison: lowercase and strip whitespace."""
    return name.lower().strip()


def _implicit_po_match(
    extracted: InvoiceExtraction, po_dataset: list[dict]
) -> tuple[dict | None, str, dict | None]:
    """
    Attempt implicit PO matching by vendor, amount, and line items (Edge Case D).

    Priority order:
      1. Exact details match (vendor + total + line items) → implicit_exact (high)
      2. Near match (vendor + total within tolerance) → implicit_near (medium)
      3. Weak signal (vendor only, any open PO) → implicit_weak (low)
      4. No vendor match at all → returns (None, "no_match", None)

    Returns: (matched_po_record | None, match_type_str, flag_dict | None)
    Note: None flag_dict means no match found at all (caller adds No Matching PO flag).
    """
    vendor_normalized = _normalize(extracted.vendor_name or "")

    # Filter to POs with matching vendor and a non-null po_total
    vendor_matches = [
        po for po in po_dataset
        if _normalize(po.get("vendor_name", "")) == vendor_normalized
        and po.get("po_total") is not None
    ]

    if not vendor_matches:
        return None, "no_match", None

    # 1. Try exact details match
    for po in vendor_matches:
        if _is_exact_match(extracted, po):
            return po, "implicit_exact", {
                "category": "PO Matching",
                "subcategory": "Implicit Match — Exact Details",
                "flag_confidence": "high",
                "detail": (
                    f"No PO number on invoice. Implicitly matched to {po['po_number']} "
                    f"based on exact vendor name ('{extracted.vendor_name}'), "
                    f"total ({extracted.total:.2f}), and line items. "
                    "Implicit matches cannot result in approve — human review required."
                ),
            }

    # 2. Try near match (vendor + total within tolerance)
    if extracted.total is not None:
        for po in vendor_matches:
            result = check_amount_tolerance(extracted.total, po["po_total"])
            if result["within_tolerance"]:
                return po, "implicit_near", {
                    "category": "PO Matching",
                    "subcategory": "Implicit Match — Near Match",
                    "flag_confidence": "medium",
                    "detail": (
                        f"No PO number on invoice. Near-match to {po['po_number']} "
                        f"based on vendor name ('{extracted.vendor_name}') and "
                        f"amount within tolerance "
                        f"(invoice {extracted.total:.2f} vs PO {po['po_total']:.2f}). "
                        "Line items do not fully match. Human review required."
                    ),
                }

    # 3. Weak signal — vendor only, take first match
    best_po = vendor_matches[0]
    return best_po, "implicit_weak", {
        "category": "PO Matching",
        "subcategory": "Implicit Match — Weak Signal",
        "flag_confidence": "low",
        "detail": (
            f"No PO number on invoice. Weak vendor-only match to {best_po['po_number']} "
            f"(vendor: '{extracted.vendor_name}'). "
            "Amount and line items do not match. Human review required."
        ),
    }


def _is_exact_match(extracted: InvoiceExtraction, po: dict) -> bool:
    """
    Check whether all invoice details match a PO exactly.

    Criteria:
      - Total within $0.01
      - Same number of line items as on the PO
      - For each invoice line item, a PO line item exists with matching
        quantity (±0.01) AND unit_price (±0.01)
    """
    if extracted.total is None or po.get("po_total") is None:
        return False
    if abs(extracted.total - po["po_total"]) > 0.01:
        return False

    po_items = po.get("line_items", [])
    inv_items = extracted.line_items

    if len(po_items) != len(inv_items):
        return False

    for inv_item in inv_items:
        match_found = any(
            abs(po_item["quantity"] - inv_item.quantity) < 0.01
            and abs(po_item["unit_price"] - inv_item.unit_price) < 0.01
            for po_item in po_items
        )
        if not match_found:
            return False

    return True


def _find_extra_line_items(
    extracted: InvoiceExtraction, po: dict
) -> list[LineItem]:
    """
    Find line items on the invoice that are NOT on the PO.

    "Extra" means: no PO line item matches this invoice line by both
    quantity (±0.01) AND unit_price (±0.01).

    Used in Stage 3c explanation check: if PO total + extra item totals ≈ invoice
    total, the overage is explained and cannot trigger reject.
    """
    po_items = po.get("line_items", [])
    extra: list[LineItem] = []

    for inv_item in extracted.line_items:
        on_po = any(
            abs(po_item["quantity"] - inv_item.quantity) < 0.01
            and abs(po_item["unit_price"] - inv_item.unit_price) < 0.01
            for po_item in po_items
        )
        if not on_po:
            extra.append(inv_item)

    return extra


def _check_duplicate(
    extracted: InvoiceExtraction,
    invoice_history: list[dict],
    reference_date,
) -> dict | None:
    """
    Duplicate detection (Stage 3d, Edge Case F) against the 60-day history window.

    Checks in priority order:
      1. Exact match: same vendor + same invoice_number, processed within 60 days
      2. Fuzzy match: same vendor + same amount + history invoice_date within 60 days

    Returns a flag dict if duplicate found, else None.
    Never auto-rejects — always returns a flag for human review.
    """
    vendor_normalized = _normalize(extracted.vendor_name or "")
    window_start = reference_date - timedelta(days=60)

    for entry in invoice_history:
        entry_vendor = _normalize(entry.get("vendor_name", ""))
        processed_str = entry.get("processed_date", "")

        try:
            processed_date = datetime.strptime(processed_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        # Only consider entries processed within the 60-day window
        if processed_date < window_start:
            continue

        # 1. Exact match: same vendor + same invoice number
        if (
            entry_vendor == vendor_normalized
            and entry.get("invoice_number") == extracted.invoice_number
        ):
            return {
                "category": "Duplicate Detection",
                "subcategory": "Exact Invoice Number Match",
                "flag_confidence": "high",
                "detail": (
                    f"Invoice '{extracted.invoice_number}' from vendor "
                    f"'{extracted.vendor_name}' was already processed on "
                    f"{processed_str} ({(reference_date - processed_date).days} days ago, "
                    f"within the 60-day window from {reference_date})."
                ),
            }

        # 2. Fuzzy match: same vendor + same amount + history invoice_date in window
        entry_inv_date_str = entry.get("invoice_date", "")
        try:
            entry_inv_date = datetime.strptime(entry_inv_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        if (
            entry_vendor == vendor_normalized
            and extracted.total is not None
            and abs(entry.get("amount", -1) - extracted.total) < 0.01
            and entry_inv_date >= window_start
        ):
            return {
                "category": "Duplicate Detection",
                "subcategory": "Fuzzy Match",
                "flag_confidence": "low",
                "detail": (
                    f"Possible duplicate: vendor '{extracted.vendor_name}' "
                    f"and amount {extracted.total:.2f} match a history entry "
                    f"(history invoice_date: {entry_inv_date_str}, "
                    f"processed: {processed_str}), within 60-day window."
                ),
            }

    return None
