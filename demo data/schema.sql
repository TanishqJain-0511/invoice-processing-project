-- Invoice Processing Pipeline — Supabase Schema
-- Paste this entire file into the Supabase SQL editor and run it.
-- Then create a Storage bucket named "invoices" with public access via the Storage tab.

-- ── Reference Data ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
    id          SERIAL PRIMARY KEY,
    po_number   TEXT UNIQUE NOT NULL,
    vendor_name TEXT NOT NULL,
    line_items  JSONB NOT NULL DEFAULT '[]',
    subtotal    NUMERIC,
    tax         NUMERIC,
    po_total    NUMERIC,           -- nullable: PO-1002 is a deferred placeholder
    status      TEXT NOT NULL,
    date_issued DATE
);

CREATE TABLE IF NOT EXISTS approved_vendors (
    id          SERIAL PRIMARY KEY,
    vendor_name TEXT UNIQUE NOT NULL,
    approved    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS invoice_history (
    id             SERIAL PRIMARY KEY,
    vendor_name    TEXT NOT NULL,
    invoice_number TEXT,
    amount         NUMERIC,
    invoice_date   DATE,
    processed_date DATE
);

-- ── Run Persistence ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invoice_filename     TEXT,
    invoice_file_path    TEXT,
    decision             TEXT NOT NULL,
    decision_confidence  TEXT,
    extraction_confidence TEXT,
    reasoning_trail      JSONB NOT NULL DEFAULT '[]',
    extracted_data       JSONB,
    matched_po           TEXT,
    flags_raised         JSONB NOT NULL DEFAULT '[]'
);
