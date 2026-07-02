"""
CLI entrypoint for the invoice processing pipeline.

Usage:
    python run_pipeline.py <path/to/invoice.pdf> [--date YYYY-MM-DD]

Loads reference data from test_data/, runs the LangGraph pipeline,
and prints the full decision output to stdout as formatted JSON.

The --date flag sets the reference date for duplicate detection and date sanity
checks. Defaults to 2026-06-25 (the test data reference date per phase_2.md).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
TEST_DATA_DIR = BASE_DIR / "test_data"

DEFAULT_REFERENCE_DATE = os.getenv("REFERENCE_DATE", "2026-06-25")


def load_reference_data() -> tuple[list[dict], list[dict], list[dict]]:
    """Load PO dataset, approved vendors, and invoice history from test_data/."""
    with open(TEST_DATA_DIR / "po_dataset.json") as f:
        po_data = json.load(f)["purchase_orders"]
    with open(TEST_DATA_DIR / "approved_vendors.json") as f:
        vendor_data = json.load(f)["approved_vendors"]
    with open(TEST_DATA_DIR / "invoice_history.json") as f:
        history_data = json.load(f)["invoice_history"]
    return po_data, vendor_data, history_data


def build_initial_state(
    pdf_path: str,
    po_data: list[dict],
    vendor_data: list[dict],
    history_data: list[dict],
    reference_date: str,
) -> dict:
    """Construct the initial PipelineState with all fields initialized."""
    return {
        # Inputs
        "invoice_pdf_path": pdf_path,
        "po_dataset": po_data,
        "approved_vendors": vendor_data,
        "invoice_history": history_data,
        "reference_date": reference_date,
        # Accumulated lists (start empty; operator.add appends node outputs)
        "reasoning_trail": [],
        "all_flags": [],
        # Scalar defaults (will be replaced by pipeline nodes)
        "raw_text": "",
        "extraction_method": "",
        "extracted_data": {},
        "extraction_confidence": "low",
        "can_proceed_to_matching": True,
        "matched_po_number": None,
        "match_type": "none",
        "decision": "",
        "decision_confidence": "low",
        "final_output": {},
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the invoice processing pipeline against a PDF."
    )
    parser.add_argument(
        "pdf_path",
        help="Path to the invoice PDF to process.",
    )
    parser.add_argument(
        "--date",
        default=DEFAULT_REFERENCE_DATE,
        metavar="YYYY-MM-DD",
        help=(
            f"Reference date for duplicate detection and date sanity checks. "
            f"Defaults to {DEFAULT_REFERENCE_DATE} (matches test data)."
        ),
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    if not os.getenv("OPENAI_API_KEY"):
        print(
            "Error: OPENAI_API_KEY is not set. "
            "Copy .env.example to .env and add your key.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\nProcessing: {pdf_path.name}")
    print(f"Reference date: {args.date}")
    print("─" * 60)

    # Load reference data
    po_data, vendor_data, history_data = load_reference_data()

    # Build and run pipeline
    from pipeline.graph import build_pipeline

    pipeline = build_pipeline()
    initial_state = build_initial_state(
        str(pdf_path), po_data, vendor_data, history_data, args.date
    )

    result = pipeline.invoke(initial_state)
    output = result["final_output"]

    # Print decision summary
    decision = output.get("decision", "?").upper()
    confidence = output.get("decision_confidence", "?")
    print(f"\nDECISION: {decision}  (decision_confidence: {confidence})")
    print(f"Extraction confidence: {output.get('extraction_confidence', '?')}")
    print(f"Matched PO: {output.get('matched_po') or 'none'}")

    flags = output.get("flags_raised", [])
    if flags:
        print(f"\nFlags raised ({len(flags)}):")
        for flag in flags:
            print(
                f"  [{flag['flag_confidence'].upper()}] "
                f"{flag['category']} / {flag['subcategory']}"
            )
            print(f"    {flag['detail']}")
    else:
        print("\nNo flags raised.")

    print("\nReasoning trail:")
    for step in output.get("reasoning_trail", []):
        print(f"  • {step}")

    # Full JSON output
    print("\n" + "─" * 60)
    print("Full output (JSON):")
    print(json.dumps(output, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
