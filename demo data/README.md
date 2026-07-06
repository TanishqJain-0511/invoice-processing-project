# Demo Kit

Everything needed to run the live demo, in one place. Source of truth is `test_data/`
and `db/` at the project root — these are copies for convenience, not a separate dataset.

## Contents

| File | Purpose |
|------|---------|
| `invoice_1_happy_path_INV-3001.pdf` ... `invoice_5_edgeF_duplicate_INV-7788.pdf` | The 5 invoices to upload, in order |
| `po_dataset.json`, `approved_vendors.json`, `invoice_history.json` | Reference data these PDFs are matched against (already loaded into Supabase via `seed.sql`) — wrapped format (`{"purchase_orders": [...]}` etc.), matches what the Python CLI/pytest expect |
| `po_dataset.upload.json`, `approved_vendors.upload.json`, `invoice_history.upload.json` | Same data as bare JSON arrays — use **these** when uploading via the app's Config page "reference data" override, which requires a top-level array and will reject the wrapped files with "Must be a JSON array" |
| `schema.sql` | Supabase table definitions (already applied — for reference only) |
| `seed.sql` | Reference data load (already applied — re-run only if rebuilding Supabase from scratch) |
| `reset.sql` | Clears `pipeline_runs` and `invoice_history` pollution from prior runs |

## Expected outcomes (reference date: 2026-06-25)

| # | Invoice | Decision | Confidence |
|---|---------|----------|------------|
| 1 | INV-3001 | approve | high |
| 2 | INV-3003 | flag (Implicit Match) | high |
| 3 | INV-3004 | flag (Explained Overage) | medium |
| 4 | INV-3005 | reject (Unexplained Overage, Beyond 3x Tolerance) | high |
| 5 | INV-7788 | flag (Exact Invoice Number Match / Duplicate) | high |

## Pre-recording checklist

1. In Supabase SQL Editor, run `reset.sql`.
2. Verify: `SELECT * FROM invoice_history;` → exactly 1 row (Global Parts Co. / INV-7788, processed 2026-05-16).
   `SELECT count(*) FROM pipeline_runs;` → 0.
3. Optional dry run: upload invoice 1 through the live app, confirm it returns `approve`.
   If you do this, **re-run `reset.sql` again** — the dry run re-inserts into `invoice_history`.
4. Confirm the upload page's reference date field is set to `2026-06-25`.
5. Record. Upload invoices 1 → 5, in order, **each exactly once**. Re-running any invoice
   mid-demo will falsely trigger a duplicate flag on the second pass.

## Why the reset step matters

Every successful (non-duplicate) run through the live backend appends the processed invoice
to `invoice_history` (`backend/api/main.py`, `/api/process` handler) so future submissions can
be checked for duplicates. That means re-running the same test PDF across multiple past
demo/test sessions leaves rows behind — e.g. invoice 1 has previously ended up flagged as a
duplicate of itself because an earlier test run inserted it into history first. `reset.sql`
clears that back to the original seed state.