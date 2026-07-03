"""
LangGraph pipeline state definition.

Uses TypedDict with Annotated reducers for fields that accumulate across nodes.
- reasoning_trail and all_flags use operator.add so each node appends its own
  entries without needing to read and re-emit the full list.
- All other fields are replaced by whichever node sets them.

Initialization: run_pipeline.py sets all fields to their defaults before invoking
the graph, so every node can safely read any field regardless of execution order.
"""

from __future__ import annotations

import operator
from typing import Annotated, Optional, TypedDict


class PipelineState(TypedDict):
    # ── Inputs (set once by caller, never modified by nodes) ──────────────────
    invoice_pdf_path: str
    po_dataset: list[dict]          # list of PO records from po_dataset.json
    approved_vendors: list[dict]    # list of vendor records from approved_vendors.json
    invoice_history: list[dict]     # list of history records from invoice_history.json
    reference_date: str             # "YYYY-MM-DD"; use "2026-06-25" for test data
    flag_rules: dict                # subcategory → "reject"|"flag" overrides from UI config

    # ── Accumulated across all nodes (operator.add auto-concatenates) ─────────
    reasoning_trail: Annotated[list[str], operator.add]
    all_flags: Annotated[list[dict], operator.add]

    # ── Stage 1: Extraction ───────────────────────────────────────────────────
    raw_text: str                   # raw text extracted from PDF by pdfplumber
    extraction_method: str          # "structured" | "ocr_required"
    extracted_data: dict            # serialized InvoiceExtraction (model_dump())
    extraction_confidence: str      # "high" | "medium" | "low"

    # ── Stage 2: Validation ───────────────────────────────────────────────────
    can_proceed_to_matching: bool   # False → skip matching, go straight to decide

    # ── Stage 3: Matching ─────────────────────────────────────────────────────
    matched_po_number: Optional[str]
    match_type: str                 # explicit | implicit_exact | implicit_near |
                                    # implicit_weak | not_found | no_match | none

    # ── Stage 4: Decision ─────────────────────────────────────────────────────
    decision: str                   # "approve" | "flag" | "reject"
    decision_confidence: str        # "high" | "medium" | "low"
    final_output: dict              # serialized DecisionOutput (model_dump())
