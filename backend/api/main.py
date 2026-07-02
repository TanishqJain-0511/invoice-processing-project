"""
FastAPI application — Invoice Processing API.

Endpoints:
    POST /api/process       Upload a PDF, run the pipeline, return the decision.
    GET  /api/runs          List all past runs (summary).
    GET  /api/runs/{run_id} Full detail for a single run.

Reference data (PO dataset, vendors, invoice history) is read from Supabase.
Each run is persisted to the pipeline_runs table and the processed invoice is
appended to invoice_history so future submissions can detect duplicates.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.db import get_supabase
from api.schemas import ProcessResponse, RunDetail, RunSummary

STORAGE_BUCKET = "invoices"

app = FastAPI(title="Invoice Processing API", version="2.0.0")

# CORS_ORIGINS env var: comma-separated list of allowed origins, e.g.
#   CORS_ORIGINS=https://my-app.vercel.app
# Defaults to "*" (all origins) for local dev / demo use.
_cors_env = os.getenv("CORS_ORIGINS", "*")
_allow_origins = [o.strip() for o in _cors_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _json_safe(obj: dict) -> dict:
    """Convert a dict to a fully JSON-serializable form (dates → ISO strings)."""
    return json.loads(json.dumps(obj, default=str))


def _build_initial_state(
    pdf_path: str,
    po_rows: list[dict],
    vendor_rows: list[dict],
    history_rows: list[dict],
    reference_date: str,
) -> dict:
    return {
        "invoice_pdf_path": pdf_path,
        "po_dataset": po_rows,
        "approved_vendors": vendor_rows,
        "invoice_history": history_rows,
        "reference_date": reference_date,
        "reasoning_trail": [],
        "all_flags": [],
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/process", response_model=ProcessResponse)
async def process_invoice(
    file: UploadFile = File(...),
    reference_date: str = Form(default=""),
):
    """
    Upload an invoice PDF and run the four-stage pipeline.

    - reference_date (optional form field, YYYY-MM-DD): defaults to today.
      Pass 2026-06-25 when testing against the test_data/ invoices.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF.")

    ref_date = reference_date.strip() or date.today().isoformat()
    supabase = get_supabase()

    # 1. Read uploaded bytes
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 2. Upload PDF to Supabase Storage
    storage_path = f"{uuid.uuid4()}_{file.filename}"
    supabase.storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        pdf_bytes,
        file_options={"content-type": "application/pdf"},
    )
    file_url: str = supabase.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)

    # 3. Load reference data from Supabase
    po_rows = supabase.table("purchase_orders").select("*").execute().data
    vendor_rows = supabase.table("approved_vendors").select("*").execute().data
    history_rows = supabase.table("invoice_history").select("*").execute().data

    # 4. Write PDF to a temp file and run the pipeline
    #    (pdfplumber needs a file path, not bytes)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        from pipeline.graph import build_pipeline

        pipeline = build_pipeline()
        initial_state = _build_initial_state(
            tmp_path, po_rows, vendor_rows, history_rows, ref_date
        )
        result = pipeline.invoke(initial_state)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    output = _json_safe(result["final_output"])

    # 5. Persist run to pipeline_runs
    run_row = {
        "invoice_filename": file.filename,
        "invoice_file_path": storage_path,
        "decision": output["decision"],
        "decision_confidence": output.get("decision_confidence"),
        "extraction_confidence": output.get("extraction_confidence"),
        "reasoning_trail": output.get("reasoning_trail", []),
        "extracted_data": output.get("extracted_data"),
        "matched_po": output.get("matched_po"),
        "flags_raised": output.get("flags_raised", []),
    }
    run_result = supabase.table("pipeline_runs").insert(run_row).execute()
    run_id: str = run_result.data[0]["id"]

    # 6. Append processed invoice to invoice_history for future duplicate detection.
    #    Only add if no duplicate was already detected (avoid growing history with dupes).
    #    Use ref_date as processed_date so the 60-day window stays consistent with
    #    whatever reference date was used for this run (important for test data).
    is_duplicate = any(
        f.get("category") == "Duplicate Detection"
        for f in output.get("flags_raised", [])
    )
    extracted = output.get("extracted_data") or {}
    if not is_duplicate and extracted.get("vendor_name") and extracted.get("invoice_number"):
        history_entry = {
            "vendor_name": extracted["vendor_name"],
            "invoice_number": extracted["invoice_number"],
            "amount": extracted.get("total"),
            "invoice_date": extracted.get("invoice_date"),
            "processed_date": ref_date,
        }
        supabase.table("invoice_history").insert(history_entry).execute()

    return ProcessResponse(
        run_id=run_id,
        invoice_file_url=file_url,
        decision=output["decision"],
        decision_confidence=output["decision_confidence"],
        extraction_confidence=output["extraction_confidence"],
        reasoning_trail=output.get("reasoning_trail", []),
        extracted_data=output.get("extracted_data", {}),
        matched_po=output.get("matched_po"),
        flags_raised=output.get("flags_raised", []),
    )


@app.get("/api/runs", response_model=list[RunSummary])
async def list_runs():
    """List all past pipeline runs, newest first."""
    supabase = get_supabase()
    rows = (
        supabase.table("pipeline_runs")
        .select(
            "id, created_at, invoice_filename, decision, "
            "decision_confidence, extraction_confidence, matched_po, flags_raised"
        )
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return [
        RunSummary(
            id=row["id"],
            created_at=row["created_at"],
            invoice_filename=row.get("invoice_filename"),
            decision=row["decision"],
            decision_confidence=row.get("decision_confidence"),
            extraction_confidence=row.get("extraction_confidence"),
            matched_po=row.get("matched_po"),
            flags_count=len(row.get("flags_raised") or []),
        )
        for row in rows
    ]


@app.get("/api/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: str):
    """Full detail for a single pipeline run, including reasoning trail and flags."""
    supabase = get_supabase()
    rows = (
        supabase.table("pipeline_runs")
        .select("*")
        .eq("id", run_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

    row = rows[0]
    file_url: str | None = None
    if row.get("invoice_file_path"):
        file_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(
            row["invoice_file_path"]
        )

    return RunDetail(
        id=row["id"],
        created_at=row["created_at"],
        invoice_filename=row.get("invoice_filename"),
        invoice_file_url=file_url,
        decision=row["decision"],
        decision_confidence=row.get("decision_confidence"),
        extraction_confidence=row.get("extraction_confidence"),
        reasoning_trail=row.get("reasoning_trail") or [],
        extracted_data=row.get("extracted_data") or {},
        matched_po=row.get("matched_po"),
        flags_raised=row.get("flags_raised") or [],
    )
