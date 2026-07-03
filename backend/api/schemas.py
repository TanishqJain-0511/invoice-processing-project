"""
Pydantic response schemas for the FastAPI endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ProcessResponse(BaseModel):
    run_id: str
    invoice_file_url: str | None
    decision: str
    decision_confidence: str
    extraction_confidence: str
    reasoning_trail: list[str]
    extracted_data: dict[str, Any]
    matched_po: str | None
    flags_raised: list[dict[str, Any]]


class RunSummary(BaseModel):
    id: str
    created_at: datetime
    invoice_filename: str | None
    decision: str
    decision_confidence: str | None
    extraction_confidence: str | None
    matched_po: str | None
    flags_count: int
    flag_categories: list[str]   # unique categories present in flags_raised
    flags_raised: list[dict[str, Any]]  # full flag objects for stale-rule detection


class RunDetail(BaseModel):
    id: str
    created_at: datetime
    invoice_filename: str | None
    invoice_file_url: str | None
    decision: str
    decision_confidence: str | None
    extraction_confidence: str | None
    reasoning_trail: list[str]
    extracted_data: dict[str, Any]
    matched_po: str | None
    flags_raised: list[dict[str, Any]]
