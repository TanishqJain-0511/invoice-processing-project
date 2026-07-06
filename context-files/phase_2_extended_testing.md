# PS-1 Invoice Processing — Phase 2 Extension: 6th Test Invoice + Supporting Reference Data

**Purpose:** Extends `phase_2.md` with the previously-deferred "Unapproved Vendor" test case
(see `Future_Scope.md` → "Deferred: Unapproved Vendor Test Case") plus the reference-data rows
needed to support it. `test_data/*.json` files are marked "do not modify" in CLAUDE.md — the
records below are additions to merge in, not replacements.

**Reference "today" date is unchanged:** `2026-06-25`.

---

## 1. New Reference Data Rows

### 1a. New PO — append to `po_dataset.json`

```json
{
  "po_number": "PO-1008",
  "vendor_name": "Ironclad Fasteners LLC",
  "line_items": [
    { "description": "Titanium Bolt Set - Grade 5, M10", "quantity": 25, "unit_price": 40.00 }
  ],
  "subtotal": 1000.00,
  "tax": 0.00,
  "po_total": 1000.00,
  "status": "open",
  "date_issued": "2026-06-12"
}
```

Note: PO-1006 remains intentionally skipped (per phase_2.md §2a realism note); PO-1008 continues
the sequence rather than reusing it, so the original "skipped number" narrative stays intact.

### 1b. New vendor (unapproved) — append to `approved_vendors.json`

```json
{ "vendor_name": "Ironclad Fasteners LLC", "approved": false }
```

This is the first *unapproved* vendor in the dataset — everything else so far has been `true`.

### 1c. New invoice_history entry — append to `invoice_history.json`

```json
{
  "vendor_name": "Meridian Office Supplies",
  "invoice_number": "INV-2900",
  "amount": 4200.00,
  "invoice_date": "2026-04-01",
  "processed_date": "2026-04-02"
}
```

This is a **negative boundary case**, not tied to any of the 6 test invoices: `processed_date`
2026-04-02 is 84 days before the 2026-06-25 reference date — outside the 60-day duplicate window.
It exists to prove the duplicate check correctly ignores old records, not just correctly catches
recent ones. It deliberately does not collide with any invoice number used below.

---

## 2. Test Invoice 6 — Edge C: Unapproved Vendor

- **Vendor:** Ironclad Fasteners LLC → **Bill To:** Delacroix Manufacturing
- **Invoice #:** INV-3006 · **Date:** 2026-06-24
- **Explicit PO Reference:** PO-1008
- **Line items:** 25× Titanium Bolt Set - Grade 5, M10 @ $40.00 = $1,000.00
- **Totals:** Subtotal $1,000.00, no tax, **Total: $1,000.00** — exact match to PO-1008, no
  freight, no extra line items
- **Comparison:** Everything reconciles perfectly against the PO — correct PO match, correct
  amount, no duplicate. The **only** issue is that `Ironclad Fasteners LLC` is not present (or is
  present with `approved: false`) in `approved_vendors.json`.
- **Expected decision:** `flag` — Category: `Vendor Validation`, Subcategory: `Unapproved Vendor`,
  `flag_confidence: high` (deterministic lookup, not LLM judgment), `decision_confidence: high`
  (single high-confidence flag, weakest-flag rule).
- **Why this case matters:** Confirms the Phase 1 design principle that an unapproved vendor,
  in isolation, never escalates to `reject` — it is purely a review flag.

---

## 3. Updated Test Data Summary (6 invoices)

| # | File | Vendor | Expected Decision |
|---|------|--------|--------------------|
| 1 | `invoice_1_happy_path_INV-3001.pdf` | Meridian Office Supplies | approve |
| 2 | `invoice_2_edgeD_implicit_PO_INV-3003.pdf` | Coastal Print & Design | flag — Implicit Match |
| 3 | `invoice_3_edgeE_explained_overage_INV-3004.pdf` | Harbor Logistics Parts | flag — Explained Overage |
| 4 | `invoice_4_edgeE_unexplained_reject_INV-3005.pdf` | Silverline Manufacturing | reject |
| 5 | `invoice_5_edgeF_duplicate_INV-7788.pdf` | Global Parts Co. | flag — Duplicate |
| 6 | *(new, spec only — no PDF yet)* `invoice_6_edgeC_unapproved_vendor_INV-3006` | Ironclad Fasteners LLC | flag — Unapproved Vendor |

No PDF has been generated for Invoice 6 yet — this file only defines the data spec, per your
"data specs only" choice. If/when a PDF is needed, `scripts/generate_invoices.py` (currently
deferred per `Future_Scope.md`) is the natural place to add it, following the same reportlab
pattern as invoices 1–5.