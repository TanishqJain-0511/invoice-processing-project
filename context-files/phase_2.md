# PS-1 Invoice Processing — Phase 2 Spec: Test Data Design
**Purpose of this document:** This defines the complete test data layer — PO dataset, approved vendor list,
invoice history log, and all test invoice PDFs — for the invoice processing pipeline defined in the Phase 1
spec. It is meant to be handed to a coding agent (Claude Code) as full context before implementation begins.
Read alongside `phase_1.md`, which defines the business rules and process logic this data is designed
to exercise.

**Status:** Edge Case A (scanned invoice) is deliberately deferred and NOT included in this phase. All data
below covers the happy path plus edge cases D, E (x2), and F only. Edge A dataset will be resolved and added in a
later pass, until then create OCR pipeline, create the pipeline, dataset to test it would given later — see Section 5.

---

## 1. Data Sourcing Decision

Test data is self-generated rather than pulled from public datasets (Kaggle/HuggingFace), per the case study's
own guidance ("create your own test inputs... make a few realistic invoice PDFs and a PO dataset"). Self-generation
gives exact control over amounts, dates, and vendor details needed to hit specific tolerance thresholds and
rule boundaries precisely. The one exception (a real scanned invoice for Edge A, to test OCR authentically) is
deferred — see Section 5.

**Reference "today" date for all test data:** `2026-06-25`. All relative-date logic (e.g. the 60-day duplicate
detection window) is computed against this date.

---

## 2. Reference Data Files

### 2a. PO Dataset — `po_dataset.json`
System-of-record purchase order data. Schema per record:
```json
{
  "po_number": "string",
  "vendor_name": "string",
  "line_items": [ { "description": "string", "quantity": "number", "unit_price": "number" } ],
  "subtotal": "number",
  "tax": "number",
  "po_total": "number",
  "status": "open" | "partially_fulfilled" | "closed",
  "date_issued": "date"
}
```

| PO Number | Vendor                             | Line Items                          | Subtotal   | Tax     | PO Total   | Status |
|-----------|------------------------------------|-------------------------------------|------------|---------|------------|--------|
| PO-1001   | Meridian Office Supplies           | 50× Office Chair @ $80.00           | $4,000.00  | $200.00 | $4,200.00  | open   |
| PO-1002   | *(placeholder — Edge A, deferred)* | —                                   | —          | —       | —          | open   |
| PO-1003   | Coastal Print & Design             | 200× Custom Brochure Print @ $12.50 | $2,500.00  | $150.00 | $2,650.00  | open   |
| PO-1004   | Harbor Logistics Parts             | 10× Hydraulic Pump Unit @ $1,250.00 | $12,500.00 | $0.00   | $12,500.00 | open   |
| PO-1005   | Silverline Manufacturing           | 40× Steel Bracket @ $50.00          | $2,000.00  | $0.00   | $2,000.00  | open   |
| PO-1007   | Global Parts Co.                   | 30× Conveyor Roller @ $115.00       | $3,450.00  | $0.00   | $3,450.00  | open   |

Note: PO-1006 is intentionally skipped in numbering — reflects realistic PO sequences where not every number
in a range corresponds to a live, open PO (some may belong to closed/cancelled POs outside this test set).

### 2b. Approved Vendor List — `approved_vendors.json`
```json
{ "vendor_name": "string", "approved": "boolean" }
```
All 5 active vendors (Meridian Office Supplies, Coastal Print & Design, Harbor Logistics Parts, Silverline
Manufacturing, Global Parts Co.) are marked `approved: true`. No unapproved-vendor test case exists in this
trimmed set — logged as deferred in `Future_Scope.md`.

### 2c. Invoice History Log — `invoice_history.json`
Pre-seeded record(s) that duplicate-detection logic (Stage 3d) queries against:
```json
{
  "vendor_name": "Global Parts Co.",
  "invoice_number": "INV-7788",
  "amount": 3450.00,
  "invoice_date": "2026-05-15",
  "processed_date": "2026-05-16"
}
```
This is the "original" invoice already on file. Test invoice 5 deliberately resubmits the same vendor +
invoice number to trigger the exact-match duplicate check (processed_date is 40 days before the reference
"today" date of 2026-06-25 — well within the 60-day window).

---

## 3. Test Invoice PDFs

All PDFs generated via a Python script using `reportlab` (Platypus + Table/TableStyle), styled to look like
real, distinct vendor invoices (each vendor has its own color scheme, header layout, and footer details) rather
than templated/identical documents. All are clean, machine-readable PDFs (no OCR fallback needed for any of these
five — that path is exclusively tested by the deferred Edge A case).

### Invoice 1 — Happy Path
- **File:** `invoice_1_happy_path_INV-3001.pdf`
- **Vendor:** Meridian Office Supplies → **Bill To:** Northgate Manufacturing Co.
- **Invoice #:** INV-3001 · **Date:** 2026-06-20
- **Explicit PO Reference:** PO-1001
- **Line items:** 50× Office Chair @ $80.00 = $4,000.00
- **Totals:** Subtotal $4,000.00 + Tax $200.00 + Freight $60.00 = **$4,260.00**
- **Comparison:** vs PO-1001 total $4,200.00 → delta $60.00, within tier tolerance (2%/$150 cap for $1K–$10K tier)
- **No duplicate** — invoice number/vendor combination not in history log
- **Expected decision:** `approve`, no flags, `decision_confidence: high`, `extraction_confidence: high`

### Invoice 2 — Edge D: Implicit PO, Exact Match
- **File:** `invoice_2_edgeD_implicit_PO_INV-3003.pdf`
- **Vendor:** Coastal Print & Design → **Bill To:** Bluewave Marketing Group
- **Invoice #:** INV-3003 · **Date:** 2026-06-21
- **PO Reference field:** deliberately absent. Only an unrelated internal "Job Ref: CPD-JOB-5591" is present,
  which must NOT be mistaken for a PO number by the extraction/matching logic.
- **Line items:** 200× Custom Brochure Print @ $12.50 = $2,500.00
- **Totals:** Subtotal $2,500.00 + Tax $150.00 = **$2,650.00**
- **Comparison:** vendor, all line items, and total match PO-1003 exactly (also $2,650.00) — but with no PO
  number stated, this can only be an *implicit* match, never a direct lookup.
- **Expected decision:** `flag` — Category: `PO Matching`, Subcategory: `Implicit Match — Exact Details`,
  `flag_confidence: high`. Per Phase 1 rules, implicit matches never reach `approve` regardless of match quality.

### Invoice 3 — Edge E: Explained Overage
- **File:** `invoice_3_edgeE_explained_overage_INV-3004.pdf`
- **Vendor:** Harbor Logistics Parts → **Bill To:** Ridgeway Industrial Systems
- **Invoice #:** INV-3004 · **Date:** 2026-06-22
- **Explicit PO Reference:** PO-1004
- **Line items:** 10× Hydraulic Pump Unit @ $1,250.00 = $12,500.00, **plus** Freight & Handling (oversize
  palletized shipment) = $600.00 — this second line item does not exist on the PO.
- **Totals:** Subtotal $13,100.00, tax exempt, **Total: $13,100.00**
- **Comparison:** vs PO-1004 total $12,500.00 → delta $600.00, exceeds the >$10K tier tolerance cap ($500).
  Deterministic line-item math: PO total ($12,500.00) + the extra freight line ($600.00) = $13,100.00 =
  invoice total exactly → delta is fully explained.
- **Expected decision:** `flag` (never reject, regardless of delta size once explained) — Category:
  `Amount Discrepancy`, Subcategory: `Explained Overage`, `flag_confidence: medium`

### Invoice 4 — Edge E: Unexplained Overage, Beyond 3x Tolerance (Reject)
- **File:** `invoice_4_edgeE_unexplained_reject_INV-3005.pdf`
- **Vendor:** Silverline Manufacturing → **Bill To:** Danforth Steel Works
- **Invoice #:** INV-3005 · **Date:** 2026-06-23
- **Explicit PO Reference:** PO-1005
- **Line items:** 40× Steel Bracket, but unit price is silently inflated to $62.50 (PO price: $50.00) — no
  additional line items, no freight, no explanatory note anywhere on the invoice.
- **Totals:** Subtotal $2,500.00, no tax, **Total: $2,500.00**
- **Comparison:** vs PO-1005 total $2,000.00 → delta $500.00. Tier tolerance (<$1,000... actually this PO
  falls in the $1,000–$10,000 tier by *PO amount*: 2%/$150 cap) → tolerance cap = $150.00, 3x cap = $450.00.
  $500.00 delta exceeds the 3x cap, and no line-item math explains it.
- **Expected decision:** `reject` — MUST also carry a flag object per the Phase 1 spec's reject-transparency
  requirement: Category: `Amount Discrepancy`, Subcategory: `Unexplained Overage — Beyond 3x Tolerance (Reject
  Trigger)`, `flag_confidence: high`, with `detail` explicitly stating the PO amount, invoice amount, delta,
  tolerance cap, and multiple of tolerance exceeded.

### Invoice 5 — Edge F: Exact Duplicate
- **File:** `invoice_5_edgeF_duplicate_INV-7788.pdf`
- **Vendor:** Global Parts Co. → **Bill To:** Peak Assembly Corp.
- **Invoice #:** **INV-7788** (deliberately reused — matches the pre-seeded `invoice_history.json` entry)
- **Date:** 2026-06-18
- **Explicit PO Reference:** PO-1007
- **Line items:** 30× Conveyor Roller @ $115.00 = $3,450.00 (identical to the original invoice on file)
- **Totals:** Subtotal $3,450.00, no tax, **Total: $3,450.00** — exact match to PO-1007
- **Comparison:** Everything about this invoice is otherwise clean (correct PO match, correct vendor, correct
  amount) — the ONLY issue is that this vendor + invoice number combination already exists in
  `invoice_history.json`, processed 2026-05-16 (40 days prior to the 2026-06-25 reference date, within the
  60-day window).
- **Expected decision:** `flag` — Category: `Duplicate Detection`, Subcategory: `Exact Invoice Number Match`,
  `flag_confidence: high`, despite otherwise being approve-eligible on every other check.

---

## 4. Cross-File Consistency Notes (for implementation validation)

- Every self-generated invoice's extracted total must reconcile exactly against its PO reference (or matched
  PO, for Invoice 2) using the tolerance/explanation logic defined in Phase 1 Section 3c — the numbers above
  were deliberately chosen to land precisely on the intended side of each threshold.
- Invoice 5's invoice_date (2026-06-18) and the history log's processed_date (2026-05-16) are both within 60
  days of the 2026-06-25 reference date — confirm any "today" or "current date" value used in implementation
  is set to 2026-06-25 (or a date consistent with this test data) so the duplicate window calculation behaves
  as designed.
- PO-1002 exists as a placeholder in `po_dataset.json` with null fields — do not treat this as a data error;
  it is intentionally incomplete pending Edge A resolution (Section 5).

---

## 5. Deferred: Edge Case A (Scanned Invoice)

**Explicitly out of scope for this phase.** Edge A (scanned/image-based invoice, testing the OCR fallback
path) has not been built. When resolved in a later pass:
- Planned source: `mychen76/invoices-and-receipts_ocr_v1` on HuggingFace, row `id=0` (vendor: "Patel, Thompson
  and Montgomery", invoice #40378170) — selected but not yet downloaded/finalized.
- The sample's original invoice date (10/15/2012) will need to be overridden to a recent date to avoid
  tripping the Stage 2 date-sanity check.
- `PO-1002` and the corresponding approved-vendor entry are placeholder records in the reference data files
  above, ready to be filled in once this sample is finalized.
- This deferral is also logged in `Future_Scope.md` under Phase 2.

---

## 6. Files Produced in This Phase

| File                                              | Purpose                                           |
|---------------------------------------------------|---------------------------------------------------|
| `po_dataset.json`                                 | PO system-of-record (6 entries, 1 placeholder)    |
| `approved_vendors.json`                           | Vendor approval lookup (5 entries, 1 placeholder) |
| `invoice_history.json`                            | Duplicate-detection seed data (1 entry)           |
| `invoice_1_happy_path_INV-3001.pdf`               | Happy path test invoice                           |
| `invoice_2_edgeD_implicit_PO_INV-3003.pdf`        | Edge D test invoice                               |
| `invoice_3_edgeE_explained_overage_INV-3004.pdf`  | Edge E (explained) test invoice                   |
| `invoice_4_edgeE_unexplained_reject_INV-3005.pdf` | Edge E (reject) test invoice                      |
| `invoice_5_edgeF_duplicate_INV-7788.pdf`          | Edge F test invoice                               |