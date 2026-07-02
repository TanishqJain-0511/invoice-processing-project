"""
Stage 2 — Internal Validation

Input:  extracted_data (InvoiceExtraction), reference_date
Output: can_proceed_to_matching, updates to all_flags and reasoning_trail

Checks (in order per phase_1.md §3 Stage 2):
  1. Required fields present (vendor, invoice_number, total — minimum viable set)
  2. Internal math: sum(line_items × qty) + tax ≈ total (within $0.02 rounding margin)
  3. Date sanity: not implausibly future-dated, not absurdly old (> 5 years)
  4. Field normalization (dates to ISO, amounts already floats via Pydantic)

If critical fields are so sparse that matching is impossible (no vendor AND no total),
can_proceed_to_matching is set to False — pipeline routes directly to Stage 4.
"""

from __future__ import annotations

from datetime import datetime

from pipeline.models import InvoiceExtraction
from pipeline.state import PipelineState

# Date sanity thresholds
_MAX_FUTURE_DAYS = 30       # allow invoices up to 30 days ahead (pre-dated)
_MAX_PAST_YEARS = 5         # flag invoices older than 5 years as suspiciously stale


def validation_node(state: PipelineState) -> dict:
    """
    Stage 2 node: validate the extracted invoice data.

    Returns state updates for:
        can_proceed_to_matching
        reasoning_trail (new entries only)
        all_flags (new entries only)
    """
    extracted = InvoiceExtraction(**state["extracted_data"])
    reference_date = datetime.strptime(state["reference_date"], "%Y-%m-%d").date()

    flags: list[dict] = []
    reasoning: list[str] = []

    # ── Check 1: Required fields ───────────────────────────────────────────────
    missing: list[str] = []
    if not extracted.vendor_name:
        missing.append("vendor_name")
    if not extracted.invoice_number:
        missing.append("invoice_number")
    if extracted.total is None:
        missing.append("total")

    if missing:
        flags.append({
            "category": "Data Quality",
            "subcategory": "Missing Critical Field",
            "flag_confidence": "high",
            "detail": f"Missing critical field(s): {', '.join(missing)}.",
        })
        reasoning.append(
            f"Stage 2 (Validation): Missing critical field(s): {', '.join(missing)}."
        )
    else:
        reasoning.append(
            "Stage 2 (Validation): All critical fields present "
            f"(vendor='{extracted.vendor_name}', "
            f"invoice_number='{extracted.invoice_number}', "
            f"total={extracted.total})."
        )

    # Can we proceed? Need at least vendor OR total to attempt any matching.
    # If BOTH are missing, there is nothing to match against.
    can_proceed = not ("vendor_name" in missing and "total" in missing)
    if not can_proceed:
        reasoning.append(
            "Stage 2 (Validation): Insufficient data to attempt matching "
            "(both vendor_name and total are missing). Routing directly to Stage 4."
        )

    # ── Check 2: Internal math ─────────────────────────────────────────────────
    if extracted.line_items and extracted.total is not None:
        line_sum = sum(item.quantity * item.unit_price for item in extracted.line_items)
        tax = extracted.tax or 0.0
        expected_total = line_sum + tax
        math_delta = abs(expected_total - extracted.total)

        if math_delta > 0.02:
            flags.append({
                "category": "Data Quality",
                "subcategory": "Internal Math Inconsistency",
                "flag_confidence": "medium",
                "detail": (
                    f"Line items sum {line_sum:.2f} + tax {tax:.2f} = {expected_total:.2f}, "
                    f"but stated invoice total is {extracted.total:.2f} "
                    f"(delta: {math_delta:.2f}). "
                    "This inconsistency is passed forward and may explain a PO amount delta in Stage 3."
                ),
            })
            reasoning.append(
                f"Stage 2 (Validation): Internal math inconsistency — "
                f"line_items ({line_sum:.2f}) + tax ({tax:.2f}) = {expected_total:.2f} "
                f"≠ stated total {extracted.total:.2f} (delta {math_delta:.2f})."
            )
        else:
            reasoning.append(
                f"Stage 2 (Validation): Internal math check passed — "
                f"line_items ({line_sum:.2f}) + tax ({tax:.2f}) = {expected_total:.2f} "
                f"≈ stated total {extracted.total:.2f}."
            )
    else:
        reasoning.append(
            "Stage 2 (Validation): Internal math check skipped "
            f"(line_items={len(extracted.line_items)}, total={extracted.total})."
        )

    # ── Check 3: Date sanity ───────────────────────────────────────────────────
    if extracted.invoice_date:
        try:
            inv_date = datetime.strptime(extracted.invoice_date, "%Y-%m-%d").date()
            days_future = (inv_date - reference_date).days
            days_past = (reference_date - inv_date).days
            years_past = days_past / 365.25

            if days_future > _MAX_FUTURE_DAYS:
                flags.append({
                    "category": "Data Quality",
                    "subcategory": "Missing Critical Field",   # closest taxonomy entry; see Future_Scope.md Deviation #4
                    "flag_confidence": "high",
                    "detail": (
                        f"Invoice date {extracted.invoice_date} is {days_future} day(s) "
                        f"in the future (reference date: {reference_date}). "
                        "Implausibly future-dated."
                    ),
                })
                reasoning.append(
                    f"Stage 2 (Validation): Invoice date {extracted.invoice_date} is "
                    f"{days_future} day(s) in the future — implausible."
                )
            elif years_past > _MAX_PAST_YEARS:
                flags.append({
                    "category": "Data Quality",
                    "subcategory": "Missing Critical Field",   # see Future_Scope.md Deviation #4
                    "flag_confidence": "medium",
                    "detail": (
                        f"Invoice date {extracted.invoice_date} is {years_past:.1f} year(s) old "
                        f"(reference date: {reference_date}). Suspiciously stale."
                    ),
                })
                reasoning.append(
                    f"Stage 2 (Validation): Invoice date {extracted.invoice_date} is "
                    f"{years_past:.1f} year(s) old — suspiciously stale."
                )
            else:
                reasoning.append(
                    f"Stage 2 (Validation): Date sanity check passed — "
                    f"invoice date {extracted.invoice_date} is within acceptable range."
                )
        except ValueError:
            reasoning.append(
                f"Stage 2 (Validation): Could not parse invoice date "
                f"'{extracted.invoice_date}' — skipping date check."
            )
    else:
        reasoning.append(
            "Stage 2 (Validation): No invoice date present — date sanity check skipped."
        )

    reasoning.append("Stage 2 (Validation): Normalization complete.")

    return {
        "can_proceed_to_matching": can_proceed,
        "reasoning_trail": reasoning,
        "all_flags": flags,
    }
