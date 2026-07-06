"""
Pipeline integration tests — one test per invoice, asserting the expected decision
and flag categories per phase_2.md §3 specifications.

Run with: pytest tests/ -v

These tests make live OpenAI API calls. Set OPENAI_API_KEY in .env or environment.
The reference date is pinned to 2026-06-25 (phase_2.md §2 reference date) so that
the 60-day duplicate detection window behaves exactly as designed.

Expected outcomes (phase_2.md §3):
  Invoice 1 — approve (happy path, no flags)
  Invoice 2 — flag: PO Matching / Implicit Match — Exact Details
  Invoice 3 — flag: Amount Discrepancy / Explained Overage
  Invoice 4 — reject + flag: Amount Discrepancy / Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)
  Invoice 5 — flag: Duplicate Detection / Exact Invoice Number Match
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
TEST_DATA_DIR = BASE_DIR.parent / "test_data"
REFERENCE_DATE = "2026-06-25"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def reference_data():
    with open(TEST_DATA_DIR / "po_dataset.json") as f:
        po_data = json.load(f)["purchase_orders"]
    with open(TEST_DATA_DIR / "approved_vendors.json") as f:
        vendor_data = json.load(f)["approved_vendors"]
    with open(TEST_DATA_DIR / "invoice_history.json") as f:
        history_data = json.load(f)["invoice_history"]
    return po_data, vendor_data, history_data


@pytest.fixture(scope="session")
def pipeline():
    from pipeline.graph import build_pipeline
    return build_pipeline()


# ── Helpers ───────────────────────────────────────────────────────────────────

def run_invoice(pipeline, reference_data, filename: str) -> dict:
    """Run the pipeline against a single test invoice PDF and return final_output."""
    from run_pipeline import build_initial_state

    po_data, vendor_data, history_data = reference_data
    pdf_path = str(TEST_DATA_DIR / filename)

    initial_state = build_initial_state(
        pdf_path, po_data, vendor_data, history_data, REFERENCE_DATE
    )
    result = pipeline.invoke(initial_state)
    return result["final_output"]


def flag_subcategories(output: dict) -> list[str]:
    """Extract the subcategory of every flag raised."""
    return [f["subcategory"] for f in output.get("flags_raised", [])]


def flag_pairs(output: dict) -> list[tuple[str, str]]:
    """Extract (category, subcategory) pairs for every flag raised."""
    return [(f["category"], f["subcategory"]) for f in output.get("flags_raised", [])]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestInvoice1HappyPath:
    """
    Invoice 1 — Happy path (phase_2.md §3, Invoice 1)
    Vendor: Meridian Office Supplies | PO-1001 | $4,260 (PO: $4,200, $60 freight)
    Delta $60 < $150 tolerance (2%/$150 floor, $1K–$10K tier) → within tolerance → approve
    """

    def test_decision_is_approve(self, pipeline, reference_data):
        output = run_invoice(pipeline, reference_data, "invoice_1_happy_path_INV-3001.pdf")
        assert output["decision"] == "approve", (
            f"Expected 'approve', got '{output['decision']}'. "
            f"Flags: {flag_pairs(output)}. "
            f"Reasoning: {output.get('reasoning_trail')}"
        )

    def test_decision_confidence_is_high(self, pipeline, reference_data):
        output = run_invoice(pipeline, reference_data, "invoice_1_happy_path_INV-3001.pdf")
        assert output["decision_confidence"] == "high"

    def test_extraction_confidence_is_high(self, pipeline, reference_data):
        output = run_invoice(pipeline, reference_data, "invoice_1_happy_path_INV-3001.pdf")
        assert output["extraction_confidence"] == "high"

    def test_no_flags_raised(self, pipeline, reference_data):
        output = run_invoice(pipeline, reference_data, "invoice_1_happy_path_INV-3001.pdf")
        assert output["flags_raised"] == [], (
            f"Expected no flags, got: {flag_pairs(output)}"
        )

    def test_matched_po(self, pipeline, reference_data):
        output = run_invoice(pipeline, reference_data, "invoice_1_happy_path_INV-3001.pdf")
        assert output["matched_po"] == "PO-1001"


class TestInvoice2EdgeDImplicitPO:
    """
    Invoice 2 — Edge Case D: Implicit PO (phase_2.md §3, Invoice 2)
    Vendor: Coastal Print & Design | No PO reference | $2,650 matching PO-1003 exactly
    All details match PO-1003 but NO explicit PO number → flag implicit exact match
    Implicit matches can NEVER approve regardless of match quality (phase_1.md §3a)
    """

    def test_decision_is_flag(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_2_edgeD_implicit_PO_INV-3003.pdf"
        )
        assert output["decision"] == "flag", (
            f"Expected 'flag', got '{output['decision']}'. "
            f"Flags: {flag_pairs(output)}. "
            f"Reasoning: {output.get('reasoning_trail')}"
        )

    def test_implicit_exact_match_flag_raised(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_2_edgeD_implicit_PO_INV-3003.pdf"
        )
        assert ("PO Matching", "Implicit Match — Exact Details") in flag_pairs(output), (
            f"Expected 'Implicit Match — Exact Details' flag, got: {flag_pairs(output)}"
        )

    def test_flag_confidence_is_high(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_2_edgeD_implicit_PO_INV-3003.pdf"
        )
        implicit_flags = [
            f for f in output["flags_raised"]
            if f["subcategory"] == "Implicit Match — Exact Details"
        ]
        assert implicit_flags, "No Implicit Match — Exact Details flag found"
        assert implicit_flags[0]["flag_confidence"] == "high"

    def test_no_po_reference_extracted(self, pipeline, reference_data):
        """CPD-JOB-5591 must not be mistaken for a PO reference."""
        output = run_invoice(
            pipeline, reference_data, "invoice_2_edgeD_implicit_PO_INV-3003.pdf"
        )
        po_ref = output.get("extracted_data", {}).get("po_reference")
        assert po_ref is None, (
            f"Expected po_reference=None, got '{po_ref}'. "
            "The internal job ref 'CPD-JOB-5591' was incorrectly extracted as a PO reference."
        )


class TestInvoice3EdgeEExplainedOverage:
    """
    Invoice 3 — Edge Case E: Explained Overage (phase_2.md §3, Invoice 3)
    Vendor: Harbor Logistics Parts | PO-1004 | $13,100 (PO: $12,500 + $600 freight)
    Delta $600 > $500 tolerance (1%/$500 floor, >$10K tier) → outside tolerance
    Line-item explanation: PO $12,500 + freight $600 = $13,100 = invoice total → explained
    → flag Explained Overage (medium), NEVER reject
    """

    def test_decision_is_flag(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_3_edgeE_explained_overage_INV-3004.pdf"
        )
        assert output["decision"] == "flag", (
            f"Expected 'flag', got '{output['decision']}'. "
            f"Flags: {flag_pairs(output)}. "
            f"Reasoning: {output.get('reasoning_trail')}"
        )

    def test_decision_is_not_reject(self, pipeline, reference_data):
        """Explained overages can NEVER trigger reject, regardless of delta size."""
        output = run_invoice(
            pipeline, reference_data, "invoice_3_edgeE_explained_overage_INV-3004.pdf"
        )
        assert output["decision"] != "reject", (
            "Invoice 3 delta is explained by freight line — must never reject."
        )

    def test_explained_overage_flag_raised(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_3_edgeE_explained_overage_INV-3004.pdf"
        )
        assert ("Amount Discrepancy", "Explained Overage") in flag_pairs(output), (
            f"Expected 'Explained Overage' flag, got: {flag_pairs(output)}"
        )

    def test_explained_overage_flag_confidence_is_medium(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_3_edgeE_explained_overage_INV-3004.pdf"
        )
        overage_flags = [
            f for f in output["flags_raised"]
            if f["subcategory"] == "Explained Overage"
        ]
        assert overage_flags, "No Explained Overage flag found"
        assert overage_flags[0]["flag_confidence"] == "medium"

    def test_matched_po(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_3_edgeE_explained_overage_INV-3004.pdf"
        )
        assert output["matched_po"] == "PO-1004"


class TestInvoice4EdgeEUnexplainedReject:
    """
    Invoice 4 — Edge Case E: Unexplained Overage → Reject (phase_2.md §3, Invoice 4)
    Vendor: Silverline Manufacturing | PO-1005 | $2,500 (PO: $2,000)
    Delta $500. Tier $1K–$10K: tolerance = max(2%×$2,000, $150) = $150. 3× = $450.
    $500 > $450 → beyond 3× cap, no line-item explanation → REJECT
    Reject must carry an explanatory flag object (phase_1.md §3c + §4)
    """

    def test_decision_is_reject(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_4_edgeE_unexplained_reject_INV-3005.pdf"
        )
        assert output["decision"] == "reject", (
            f"Expected 'reject', got '{output['decision']}'. "
            f"Flags: {flag_pairs(output)}. "
            f"Reasoning: {output.get('reasoning_trail')}"
        )

    def test_reject_flag_is_present(self, pipeline, reference_data):
        """Reject is never bare — must carry Unexplained Overage — Beyond 3x flag."""
        output = run_invoice(
            pipeline, reference_data, "invoice_4_edgeE_unexplained_reject_INV-3005.pdf"
        )
        assert (
            "Amount Discrepancy",
            "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)",
        ) in flag_pairs(output), (
            f"Reject flag missing from flags_raised. Got: {flag_pairs(output)}"
        )

    def test_reject_flag_confidence_is_high(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_4_edgeE_unexplained_reject_INV-3005.pdf"
        )
        reject_flags = [
            f for f in output["flags_raised"]
            if "Beyond 3x Tolerance" in f["subcategory"]
        ]
        assert reject_flags, "No reject trigger flag found"
        assert reject_flags[0]["flag_confidence"] == "high"

    def test_reject_flag_detail_contains_amounts(self, pipeline, reference_data):
        """Flag detail must include PO amount, invoice amount, delta, and caps."""
        output = run_invoice(
            pipeline, reference_data, "invoice_4_edgeE_unexplained_reject_INV-3005.pdf"
        )
        reject_flags = [
            f for f in output["flags_raised"]
            if "Beyond 3x Tolerance" in f["subcategory"]
        ]
        assert reject_flags
        detail = reject_flags[0]["detail"]
        # Should mention key amounts
        assert "2000" in detail or "2,000" in detail, f"PO amount missing from detail: {detail}"
        assert "2500" in detail or "2,500" in detail, f"Invoice amount missing from detail: {detail}"

    def test_matched_po(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_4_edgeE_unexplained_reject_INV-3005.pdf"
        )
        assert output["matched_po"] == "PO-1005"


class TestInvoice5EdgeFDuplicate:
    """
    Invoice 5 — Edge Case F: Exact Duplicate (phase_2.md §3, Invoice 5)
    Vendor: Global Parts Co. | PO-1007 | INV-7788 | $3,450
    Everything is otherwise clean — explicit PO match, correct amount, approved vendor.
    BUT: INV-7788 + Global Parts Co. already in invoice_history.json,
    processed 2026-05-16 (40 days before reference date 2026-06-25 = within 60-day window)
    → flag Duplicate Detection / Exact Invoice Number Match (high)
    """

    def test_decision_is_flag(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_5_edgeF_duplicate_INV-7788.pdf"
        )
        assert output["decision"] == "flag", (
            f"Expected 'flag', got '{output['decision']}'. "
            f"Flags: {flag_pairs(output)}. "
            f"Reasoning: {output.get('reasoning_trail')}"
        )

    def test_exact_duplicate_flag_raised(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_5_edgeF_duplicate_INV-7788.pdf"
        )
        assert ("Duplicate Detection", "Exact Invoice Number Match") in flag_pairs(output), (
            f"Expected 'Exact Invoice Number Match' flag. Got: {flag_pairs(output)}"
        )

    def test_duplicate_flag_confidence_is_high(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_5_edgeF_duplicate_INV-7788.pdf"
        )
        dup_flags = [
            f for f in output["flags_raised"]
            if f["subcategory"] == "Exact Invoice Number Match"
        ]
        assert dup_flags, "No Exact Invoice Number Match flag found"
        assert dup_flags[0]["flag_confidence"] == "high"

    def test_no_reject_despite_duplicate(self, pipeline, reference_data):
        """Duplicates always flag, never auto-reject (phase_1.md §3d)."""
        output = run_invoice(
            pipeline, reference_data, "invoice_5_edgeF_duplicate_INV-7788.pdf"
        )
        assert output["decision"] != "reject", (
            "Duplicate detection must never trigger reject."
        )

    def test_matched_po(self, pipeline, reference_data):
        output = run_invoice(
            pipeline, reference_data, "invoice_5_edgeF_duplicate_INV-7788.pdf"
        )
        assert output["matched_po"] == "PO-1007"
