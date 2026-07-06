# Demo Data — Separate Universe (6 Invoices + Reference Data)

**Purpose:** A self-contained dataset for live demos (Build Order Step 7), deliberately using
different vendors, PO numbers, and bill-to companies than `test_data/` so a demo recording
doesn't look like a replay of the automated test fixtures. Covers the same 6 outcome categories
as the extended test set (see `context-files/phase_2_extended_testing.md`).

Files: `demo_data/po_dataset.json` (7 POs), `demo_data/approved_vendors.json` (7 vendors, 1
unapproved), `demo_data/invoice_history.json` (2 entries).

**Reference "today" date:** `2026-06-25` (same convention as test data, for consistent 60-day
duplicate-window math).

---

## Demo Invoice A — Happy Path (approve)

- **Vendor:** Lakeshore Packaging Co. → **Bill To:** Summit Foods Group
- **Invoice #:** INV-9101 · **Date:** 2026-06-24
- **Explicit PO Reference:** PO-2001
- **Line items:** 100× Corrugated Shipping Box - Medium @ $3.20 = $320.00
- **Totals:** Subtotal $320.00 + Tax $16.00 = **$336.00** — exact match to PO-2001 total
- **Expected decision:** `approve`, no flags, `decision_confidence: high`

## Demo Invoice B — Implicit PO Match (flag)

- **Vendor:** BrightLeaf Print Studio → **Bill To:** Union Creative Agency
- **Invoice #:** INV-9102 · **Date:** 2026-06-22
- **PO Reference field:** absent. Only an unrelated internal "Project Code: BLP-2291" is present.
- **Line items:** 150× Poster Print - Large Format @ $9.00 = $1,350.00
- **Totals:** Subtotal $1,350.00 + Tax $81.00 = **$1,431.00** — exact match to PO-2002
- **Expected decision:** `flag` — Category: `PO Matching`, Subcategory:
  `Implicit Match — Exact Details`, `flag_confidence: high`

## Demo Invoice C — Explained Overage (flag)

- **Vendor:** Cascade Machine Works → **Bill To:** Northfield Assembly
- **Invoice #:** INV-9103 · **Date:** 2026-06-23
- **Explicit PO Reference:** PO-2003
- **Line items:** 20× Precision Gearbox Unit @ $900.00 = $18,000.00, **plus** "Expedited Freight
  (rush order)" = $700.00 (not on the PO)
- **Totals:** Subtotal $18,700.00, tax exempt, **Total: $18,700.00**
- **Comparison:** vs PO-2003 total $18,000.00 → delta $700.00. Tier >$10K tolerance:
  max(1%×$18,000, $500) = $500 → delta exceeds tolerance, but exactly matches the extra freight
  line → fully explained.
- **Expected decision:** `flag` — Category: `Amount Discrepancy`, Subcategory:
  `Explained Overage`, `flag_confidence: medium`

## Demo Invoice D — Unexplained Overage, Beyond 3× Tolerance (reject)

- **Vendor:** Vantage Steel Supply → **Bill To:** Ironforge Construction
- **Invoice #:** INV-9104 · **Date:** 2026-06-24
- **Explicit PO Reference:** PO-2004
- **Line items:** 60× Rebar Coil - Grade 60, unit price silently inflated to $55.00 (PO price:
  $45.00) — no additional line items, no explanatory note
- **Totals:** Subtotal $3,300.00, no tax, **Total: $3,300.00**
- **Comparison:** vs PO-2004 total $2,700.00 → delta $600.00. Tier $1K–$10K: max(2%×$2,700, $150)
  = $150 → 3× cap = $450. Delta $600 exceeds the 3× cap with no line-item explanation.
- **Expected decision:** `reject` — MUST carry a flag: Category: `Amount Discrepancy`,
  Subcategory: `Unexplained Overage — Beyond 3× Tolerance (Reject Trigger)`,
  `flag_confidence: high`

## Demo Invoice E — Exact Duplicate (flag)

- **Vendor:** Overlook Freight Systems → **Bill To:** Bayview Distribution
- **Invoice #:** INV-8850 (reused — matches the seeded `invoice_history.json` entry)
- **Date:** 2026-06-19
- **Explicit PO Reference:** PO-2005
- **Line items:** 15× Pallet Wrap Roll - Industrial @ $28.00 = $420.00 — exact match to PO-2005
- **Comparison:** Everything else is clean; the only issue is that this vendor + invoice number
  already exists in `invoice_history.json`, processed 2026-05-21 (35 days before the 2026-06-25
  reference date — within the 60-day window).
- **Expected decision:** `flag` — Category: `Duplicate Detection`, Subcategory:
  `Exact Invoice Number Match`, `flag_confidence: high`

## Demo Invoice F — Unapproved Vendor (flag)

- **Vendor:** Redwood Coatings Inc. → **Bill To:** Pinnacle Fabrication
- **Invoice #:** INV-9106 · **Date:** 2026-06-21
- **Explicit PO Reference:** PO-2006
- **Line items:** 80× Powder Coat Finish - Standard Color @ $6.50 = $520.00 — exact match to
  PO-2006
- **Comparison:** Everything reconciles perfectly; the only issue is that `Redwood Coatings Inc.`
  is marked `approved: false`.
- **Expected decision:** `flag` — Category: `Vendor Validation`, Subcategory:
  `Unapproved Vendor`, `flag_confidence: high`

---

## Extra Reference Data (not tied to any single demo invoice above)

- **PO-2010** (Granite Ridge Components, $425.00, open) — an unreferenced open PO sitting in the
  system, for realism when browsing the PO list during a demo.
- **INV-8700** (Lakeshore Packaging Co., $336.00, processed 2026-03-02) — a negative boundary
  case: 115 days before the reference date, well outside the 60-day duplicate window, so it
  proves old history doesn't cause false-positive duplicate flags.

---

## Summary Table

| # | Invoice # | Vendor | Expected Decision |
|---|-----------|--------|--------------------|
| A | INV-9101 | Lakeshore Packaging Co. | approve |
| B | INV-9102 | BrightLeaf Print Studio | flag — Implicit Match |
| C | INV-9103 | Cascade Machine Works | flag — Explained Overage |
| D | INV-9104 | Vantage Steel Supply | reject |
| E | INV-8850 | Overlook Freight Systems | flag — Duplicate |
| F | INV-9106 | Redwood Coatings Inc. | flag — Unapproved Vendor |

No PDFs generated (data specs only, per your choice). If PDFs are needed later for the actual
demo recording, these specs give reportlab (or the LLM) everything needed to produce them
following the same style as `test_data/`'s 5 originals.
