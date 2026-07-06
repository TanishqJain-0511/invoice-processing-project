"""
Stage 4 — Decision

Input:  all upstream signals accumulated in state
Output: decision, decision_confidence, final_output (DecisionOutput)

Decision precedence (phase_1.md §3 Stage 4, extended by Settings → Approve escalation):
  REJECT  — if the hardcoded trigger fires, OR any raised flag's subcategory is
            user-configured to "reject" in flag_rules. Reject is never returned
            without a corresponding flag object.
  FLAG    — if any flag is in all_flags, no reject fires, and at least one of those
            flags is NOT configured to "approve" in flag_rules.
  APPROVE — if all_flags is empty (see conditions below), OR if every raised flag's
            subcategory is user-configured to "approve" in flag_rules.
            Escalation order across multiple triggered rules: Reject > Flag > Approve.

  With no flags raised at all, APPROVE additionally requires ALL of:
              - match_type == "explicit"
              - no Unapproved Vendor flag
              - no Amount Discrepancy flag
              - no Duplicate Detection flag
              - extraction_confidence == "high"
              - no Data Quality flags

Decision confidence roll-up:
  - No flags → "high" (approve case)
  - Any flags → weakest flag_confidence among all flags
  - Confidence rank: high=3, medium=2, low=1
"""

from __future__ import annotations

from pipeline.models import DecisionOutput, Flag, InvoiceExtraction
from pipeline.state import PipelineState

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}
_RANK_CONFIDENCE = {3: "high", 2: "medium", 1: "low"}

_REJECT_SUBCATEGORY = "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)"


def decision_node(state: PipelineState) -> dict:
    """
    Stage 4 node: synthesize all upstream signals into the final decision.

    Returns state updates for:
        decision
        decision_confidence
        final_output (serialized DecisionOutput)
        reasoning_trail (new entries only)
    """
    extracted = InvoiceExtraction(**state["extracted_data"])
    all_flags: list[dict] = state.get("all_flags", [])
    extraction_confidence: str = state.get("extraction_confidence", "low")
    match_type: str = state.get("match_type", "none")
    matched_po_number: str | None = state.get("matched_po_number")

    new_reasoning: list[str] = []

    flag_rules: dict = state.get("flag_rules", {})

    # ── Determine decision ────────────────────────────────────────────────────

    has_reject_trigger = any(
        f.get("subcategory") == _REJECT_SUBCATEGORY for f in all_flags
    )

    # User-configured rejects: any flag whose subcategory is toggled to "reject" in the UI
    custom_reject_flags = [
        f for f in all_flags
        if flag_rules.get(f.get("subcategory")) == "reject"
        and f.get("subcategory") != _REJECT_SUBCATEGORY  # don't double-count
    ]

    if has_reject_trigger:
        decision = "reject"
        new_reasoning.append(
            "Stage 4 (Decision): REJECT — "
            "'Unexplained Overage — Beyond 3× Tolerance (Reject Trigger)' flag found. "
            "This is the only path that produces a reject. See flags_raised for detail."
        )

    elif custom_reject_flags:
        decision = "reject"
        escalated = "; ".join(f["subcategory"] for f in custom_reject_flags)
        new_reasoning.append(
            f"Stage 4 (Decision): REJECT — business rules configured to reject on: [{escalated}]. "
            "See flags_raised for detail."
        )

    elif all_flags and all(flag_rules.get(f.get("subcategory")) == "approve" for f in all_flags):
        decision = "approve"
        flag_summary = "; ".join(
            f"{f['category']} / {f['subcategory']}" for f in all_flags
        )
        new_reasoning.append(
            f"Stage 4 (Decision): APPROVE — {len(all_flags)} flag(s) raised [{flag_summary}], "
            "but business rules configure all of them to auto-approve. No human review required."
        )

    elif all_flags:
        decision = "flag"
        flag_summary = "; ".join(
            f"{f['category']} / {f['subcategory']}" for f in all_flags
        )
        new_reasoning.append(
            f"Stage 4 (Decision): FLAG — {len(all_flags)} flag(s) raised: [{flag_summary}]. "
            "Human review required."
        )

    else:
        # No flags — check all approve conditions
        is_explicit = match_type == "explicit"
        is_high_extraction = extraction_confidence == "high"

        if is_explicit and is_high_extraction:
            decision = "approve"
            new_reasoning.append(
                "Stage 4 (Decision): APPROVE — all checks passed: "
                f"explicit PO match ({matched_po_number}), "
                "approved vendor, amount within tolerance, no duplicates, "
                "no validation issues, high extraction confidence."
            )
        else:
            # Safety net: shouldn't reach here if flags are raised correctly,
            # but handle it gracefully
            decision = "flag"
            reasons = []
            if not is_explicit:
                reasons.append(f"match_type='{match_type}' (not explicit)")
            if not is_high_extraction:
                reasons.append(f"extraction_confidence='{extraction_confidence}'")
            new_reasoning.append(
                f"Stage 4 (Decision): FLAG (safety net) — "
                f"no flags raised but approve conditions not fully met: "
                f"{'; '.join(reasons)}."
            )

    # ── Decision confidence roll-up ───────────────────────────────────────────
    if not all_flags:
        decision_confidence = "high"
    else:
        min_rank = min(
            _CONFIDENCE_RANK.get(f.get("flag_confidence", "low"), 1)
            for f in all_flags
        )
        decision_confidence = _RANK_CONFIDENCE[min_rank]

    new_reasoning.append(
        f"Stage 4 (Decision): decision_confidence={decision_confidence} "
        f"(rolled up from {len(all_flags)} flag(s); "
        f"weakest flag_confidence determines the ceiling)."
    )

    # ── Build final output ────────────────────────────────────────────────────
    # Combine all reasoning (prior stages + this stage's new entries)
    prior_reasoning: list[str] = state.get("reasoning_trail", [])
    full_reasoning = prior_reasoning + new_reasoning

    final_output = DecisionOutput(
        decision=decision,
        decision_confidence=decision_confidence,
        extraction_confidence=extraction_confidence,
        reasoning_trail=full_reasoning,
        extracted_data=extracted,
        matched_po=matched_po_number,
        flags_raised=[Flag(**f) for f in all_flags],
    )

    return {
        "decision": decision,
        "decision_confidence": decision_confidence,
        "reasoning_trail": new_reasoning,
        "final_output": final_output.model_dump(),
    }
