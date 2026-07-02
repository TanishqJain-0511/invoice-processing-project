"""
Pydantic models for the invoice processing pipeline.

These models serve two purposes:
1. Structured output schema for LLM extraction (Stage 1)
2. Internal data contracts between pipeline stages (Stages 2–4)

All models correspond to the output contract defined in phase_1.md §2.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class LineItem(BaseModel):
    description: str
    quantity: float
    unit_price: float


class InvoiceExtraction(BaseModel):
    """
    Structured output from Stage 1 extraction.
    Maps to the extracted_data field in the final DecisionOutput.

    LLM is instructed to populate po_reference ONLY for explicit PO references
    (not internal job refs like 'Job Ref: CPD-JOB-5591' — see CLAUDE.md).
    """

    vendor_name: Optional[str] = Field(
        default=None,
        description="Vendor/supplier company name as printed on the invoice.",
    )
    invoice_number: Optional[str] = Field(
        default=None,
        description="Invoice number or invoice ID (e.g. INV-3001).",
    )
    invoice_date: Optional[str] = Field(
        default=None,
        description="Invoice date in ISO format YYYY-MM-DD. Null if not found.",
    )
    line_items: list[LineItem] = Field(
        default_factory=list,
        description=(
            "All charge lines on the invoice including freight, handling, or other "
            "surcharges if they appear as distinct line items. Do NOT include tax as "
            "a line item — put tax in the tax field instead."
        ),
    )
    subtotal: Optional[float] = Field(
        default=None,
        description="Pre-tax subtotal as stated on the invoice.",
    )
    tax: Optional[float] = Field(
        default=None,
        description="Tax amount as stated on the invoice. Null or 0 if tax-exempt.",
    )
    total: Optional[float] = Field(
        default=None,
        description="Final invoice total (the amount being requested for payment).",
    )
    po_reference: Optional[str] = Field(
        default=None,
        description=(
            "Purchase Order number explicitly stated on the invoice "
            "(e.g. 'PO-1001', 'PO #1001'). "
            "Set to null if the invoice contains no explicit PO reference. "
            "Internal job references, work order numbers, client codes, or any "
            "reference not explicitly labeled as a Purchase Order must be null."
        ),
    )


class Flag(BaseModel):
    """A single flag raised during pipeline processing. Matches the taxonomy in phase_1.md §5."""

    category: str
    subcategory: str
    flag_confidence: Literal["high", "medium", "low"]
    detail: str


class DecisionOutput(BaseModel):
    """
    Final pipeline output — the complete decision object.
    Matches the output contract in phase_1.md §2.
    """

    decision: Literal["approve", "flag", "reject"]
    decision_confidence: Literal["high", "medium", "low"]
    extraction_confidence: Literal["high", "medium", "low"]
    reasoning_trail: list[str]
    extracted_data: InvoiceExtraction
    matched_po: Optional[str] = None
    flags_raised: list[Flag] = Field(default_factory=list)
