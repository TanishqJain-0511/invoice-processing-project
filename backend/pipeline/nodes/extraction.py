"""
Stage 1 — Extraction

Input:  raw invoice PDF path
Output: extracted_data (InvoiceExtraction), extraction_confidence, extraction_method

Fast path:
  pdfplumber → raw text → detection check → LLM structured output (GPT-4o)

Fallback:
  OCR via Docling — DEFERRED (Edge Case A). Stubbed below.
  When the text is unusable, the node sets extraction_confidence=low and
  can_proceed_to_matching=False, routing the pipeline straight to Stage 4.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from pipeline.models import InvoiceExtraction
from pipeline.state import PipelineState
from pipeline.utils.pdf_parser import extract_text_from_pdf, is_text_usable

# ── Extraction prompt ──────────────────────────────────────────────────────────
# Critical rule: po_reference must only be populated for EXPLICIT PO references.
# Invoice 2 contains "Job Ref: CPD-JOB-5591" which must NOT become po_reference.
# The field description in InvoiceExtraction.po_reference carries this instruction
# to the LLM via the structured-output schema. The prompt reinforces it.

_EXTRACTION_PROMPT = """You are an invoice data extraction assistant. Extract all structured \
fields from the invoice text below and return them in the requested schema.

RULES (follow strictly):
1. po_reference — ONLY set this if the invoice explicitly labels a number as a Purchase Order \
(e.g. "PO #", "PO Number:", "Purchase Order:", "P.O.:"). Internal job references, work order \
numbers, client codes, or any reference NOT explicitly labeled as a Purchase Order must be null.
2. line_items — include every distinct charge line (goods, freight, handling, surcharges). \
Do NOT include tax as a line item; put it in the tax field.
3. invoice_date — ISO format YYYY-MM-DD. Null if absent.
4. Any field that is absent or unclear → null (never guess).

Invoice text:
{raw_text}"""


def extraction_node(state: PipelineState) -> dict:
    """
    Stage 1 node: extract structured invoice data from PDF.

    Returns state updates for:
        raw_text, extraction_method, extracted_data, extraction_confidence
        reasoning_trail (new entries only — operator.add appends them)
        all_flags (new entries only — operator.add appends them)
        can_proceed_to_matching (set to False if OCR required but not yet implemented)
    """
    pdf_path = state["invoice_pdf_path"]
    reasoning: list[str] = []
    flags: list[dict] = []

    # ── Step 1: Extract raw text ───────────────────────────────────────────────
    raw_text = extract_text_from_pdf(pdf_path)

    # ── Step 2: Detection check ────────────────────────────────────────────────
    if not is_text_usable(raw_text):
        # Edge Case A: OCR fallback — not yet implemented
        reasoning.append(
            f"Stage 1 (Extraction): PDF text extraction yielded empty or unusable content "
            f"(length={len(raw_text)} chars). OCR fallback required — "
            f"Edge Case A is deferred; pipeline cannot proceed."
        )
        flags.append({
            "category": "Data Quality",
            "subcategory": "Low Extraction Confidence",
            "flag_confidence": "low",
            "detail": (
                "PDF yielded empty or unreadable text. OCR fallback (Docling) "
                "is not yet implemented (Edge Case A deferred). Cannot extract invoice data."
            ),
        })
        return {
            "raw_text": raw_text,
            "extraction_method": "ocr_required",
            "extracted_data": InvoiceExtraction().model_dump(),
            "extraction_confidence": "low",
            "can_proceed_to_matching": False,
            "reasoning_trail": reasoning,
            "all_flags": flags,
        }

    reasoning.append(
        f"Stage 1 (Extraction): pdfplumber extracted {len(raw_text)} chars of usable text. "
        f"Proceeding with LLM structured extraction (gpt-4o-mini)."
    )

    # ── Step 3: LLM structured output extraction ───────────────────────────────
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    structured_llm = llm.with_structured_output(InvoiceExtraction)

    prompt = _EXTRACTION_PROMPT.format(raw_text=raw_text)
    extracted: InvoiceExtraction = structured_llm.invoke(prompt)

    # ── Step 4: Assess extraction confidence ──────────────────────────────────
    extraction_confidence = _assess_confidence(extracted)

    reasoning.append(
        f"Stage 1 (Extraction): LLM extracted — "
        f"vendor='{extracted.vendor_name}', "
        f"invoice_number='{extracted.invoice_number}', "
        f"date='{extracted.invoice_date}', "
        f"total={extracted.total}, "
        f"po_reference='{extracted.po_reference}', "
        f"line_items={len(extracted.line_items)}. "
        f"extraction_confidence={extraction_confidence}."
    )

    # Flag low extraction confidence now so it participates in Stage 4 roll-up
    if extraction_confidence != "high":
        flags.append({
            "category": "Data Quality",
            "subcategory": "Low Extraction Confidence",
            "flag_confidence": "medium",
            "detail": (
                f"Extraction confidence is '{extraction_confidence}'. "
                f"Some critical fields may be missing: "
                f"vendor={'present' if extracted.vendor_name else 'MISSING'}, "
                f"invoice_number={'present' if extracted.invoice_number else 'MISSING'}, "
                f"total={'present' if extracted.total is not None else 'MISSING'}, "
                f"line_items={len(extracted.line_items)}."
            ),
        })

    return {
        "raw_text": raw_text,
        "extraction_method": "structured",
        "extracted_data": extracted.model_dump(),
        "extraction_confidence": extraction_confidence,
        "can_proceed_to_matching": True,
        "reasoning_trail": reasoning,
        "all_flags": flags,
    }


def _assess_confidence(extracted: InvoiceExtraction) -> str:
    """
    Assess overall extraction confidence from field completeness.

    high   — vendor, invoice_number, total all present AND at least one line item
    medium — at least 2 of 3 critical fields present
    low    — fewer than 2 critical fields

    See Future_Scope.md "Deviation #3" — per-field confidence is deferred.
    """
    critical = [extracted.vendor_name, extracted.invoice_number, extracted.total]
    present = sum(1 for f in critical if f is not None)
    has_items = len(extracted.line_items) > 0

    if present == 3 and has_items:
        return "high"
    elif present >= 2:
        return "medium"
    else:
        return "low"
