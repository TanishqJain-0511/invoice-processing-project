"""
PDF text extraction for Stage 1 fast path.

Tool choice: pdfplumber (lightweight, pure-Python, no ML model download).
Docling is reserved for the OCR fallback path (Edge Case A, deferred).
See Future_Scope.md "Deviation #2" for rationale.

Detection check: determines whether extracted text is usable or requires OCR fallback.
This check is an explicit decision point per phase_1.md Stage 1 design principle —
it is not a silent try/except.
"""

from __future__ import annotations

import re

import pdfplumber


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract raw text from a machine-readable PDF using pdfplumber.

    Returns concatenated text across all pages. Returns empty string if the
    PDF yields nothing (which triggers the OCR fallback detection check).
    """
    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                parts.append(page_text)
    return "\n".join(parts)


def is_text_usable(text: str) -> bool:
    """
    Detection check (phase_1.md Stage 1, Step 2):
    Is the extracted text good enough to proceed with structured LLM extraction?

    Returns False → OCR fallback required (Edge Case A).

    Criteria (all must pass):
    1. Non-empty and reasonably long (> 50 printable chars)
    2. ≥ 80% printable characters (rules out binary garbage)
    3. Contains at least one dollar amount or decimal number (minimum invoice signal)
    """
    stripped = text.strip()
    if not stripped or len(stripped) < 50:
        return False

    printable_ratio = sum(1 for c in text if c.isprintable()) / len(text)
    if printable_ratio < 0.80:
        return False

    # Require at least one amount-like pattern: $1,234.56 or plain 1234.56
    if not re.search(r"\$[\d,]+\.?\d*|\d{1,6}\.\d{2}", stripped):
        return False

    return True
