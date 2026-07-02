# Future_Scope.md — Deferred Items & Explicit Deviations

This file tracks every item that was deliberately deferred, simplified, or deviated from the
original spec. Each entry records what was decided, why, and what the future resolution is.

---

## Deviations from Spec (Flagged Implementation Decisions)

### Deviation #1 — Tolerance formula: max() not min()

**What the spec says:** phase_1.md §3c table reads "2%, capped at $150" — the word "capped"
normally implies a ceiling (maximum).

**What was implemented:** `tolerance = max(pct × po_total, dollar_floor)` — treating the dollar
figure as a floor (minimum), not a ceiling.

**Why:** phase_2.md's worked example for Invoice 4 (PO-1005, $2,000) explicitly states:
"tolerance cap = $150.00, 3x cap = $450.00". Under a ceiling interpretation, tolerance would be
min(2%×$2,000, $150) = min($40, $150) = $40, and 3× = $120. But the spec says $450.
The only way to get $450 is max($40, $150) = $150 → 3× = $450. The test numbers are authoritative.

**Impact on test outcomes:** None — both interpretations produce `reject` for Invoice 4 (delta
$500 exceeds both $120 and $450). The reasoning trail numbers ($450 vs $120) differ.

**Future resolution:** Confirm with spec author which interpretation is intended. If ceiling was
intended, the test data numbers in phase_2.md contain an error and should be corrected.

---

### Deviation #2 — PDF fast path uses pdfplumber, not Docling

**What the spec says:** tech_stack.md says "Docling or equivalent" for the fast-path PDF parser.
User confirmed Docling for OCR. For the fast path, "or equivalent" was used.

**What was implemented:** `pdfplumber` for the Stage 1 fast-path text extraction.

**Why:** Docling's first run downloads ~2GB of ML models and spins up ML inference — unnecessarily
heavy for clean, machine-readable PDFs. pdfplumber is pure Python, zero-download, and handles all
5 test PDFs (which are all clean). Docling remains the OCR fallback when Edge A is implemented.

**Future resolution:** Swap fast-path to Docling if it provides meaningfully better text layout
preservation for more complex real-world PDFs. Not needed for current test set.

---

### Deviation #3 — Extraction confidence based on field completeness, not per-field score

**What the spec says:** phase_1.md §3 says "Attach extraction_confidence (per-field or overall)
reflecting how cleanly data was pulled vs. inferred/uncertain."

**What was implemented:** A simple overall score based on the count of critical fields present
(vendor, invoice_number, total all present + at least one line item → high; otherwise medium/low).

**Why:** Per-field confidence requires the LLM to return a confidence score per field, which adds
prompt complexity and is unnecessary for clean PDFs where the LLM extracts everything correctly.

**Future resolution:** For production use, add per-field confidence by asking the LLM to rate each
field extraction separately (e.g., using a separate Pydantic field like `vendor_name_confidence`).

---

### Deviation #4 — Date sanity flags use "Missing Critical Field" category as placeholder

**What was implemented:** Invalid invoice dates (too far future or absurdly old) are flagged using
the "Data Quality / Missing Critical Field" category because the flag taxonomy in phase_1.md §5
doesn't include a dedicated "Invalid Date" subcategory.

**Future resolution:** Add a "Data Quality / Invalid Invoice Date" entry to the flag taxonomy in
phase_1.md if date sanity issues become a common failure mode in real invoices.

---

## Deferred Features (from phase_2.md §5 and tech_stack.md §5)

### Deferred: Edge Case A — Scanned Invoice / OCR Fallback

**Status:** Architecture stubbed (extraction.py detects unusable text and returns low-confidence
output); OCR logic not implemented.

**When to implement:** After all 5 clean-PDF test cases pass. Will require:
- Docling integration in `pipeline/utils/ocr.py`
- A real scanned invoice test case from HuggingFace `mychen76/invoices-and-receipts_ocr_v1`, row id=0
- Override the original invoice date (10/15/2012) to a recent date to pass Stage 2 date sanity check
- Fill in `PO-1002` and the "TBD - Edge A" approved vendor placeholder with real data from the sample

---

### Deferred: Unapproved Vendor Test Case

**Status:** All 5 active vendors in `approved_vendors.json` are marked approved. No test invoice
exercises the `Vendor Validation / Unapproved Vendor` flag path.

**When to implement:** Add a 6th test invoice from a non-approved vendor. Confirm that
`Unapproved Vendor` flag alone does not trigger reject (per phase_1.md §3b design principle).

---

### Deferred: FastAPI Backend (Build Order Step 2)

**Status:** Not started. Pipeline is locally runnable via `run_pipeline.py` CLI only.

**When to implement:** After all 5 pipeline tests pass. Wrap pipeline in FastAPI, connect Supabase
for reference data reads and run history writes.

---

### Deferred: Next.js Frontend (Build Order Steps 3–4)

**Status:** Not started.

**When to implement:** After FastAPI backend is validated.

---

### Deferred: PDF Generation Script

**Status:** The 5 test PDFs already exist in `test_data/` (pre-generated). A
`scripts/generate_invoices.py` using reportlab was planned but not created since it was not needed.

**When to implement:** If PDFs need to be regenerated or new test cases added.

---

### Deferred: Fuzzy Vendor Name Matching

**Status:** Current implementation uses exact normalized match (lowercase + strip) for vendor
name comparison in Stage 3a implicit matching and Stage 3b vendor check.

**When to implement:** If real invoices show vendor name spelling variations (e.g.,
"Harbor Logistics Parts Inc." vs "Harbor Logistics Parts"). Could use difflib or rapidfuzz.

---

### Deferred: Multi-PO Invoices (Invoice Spanning Multiple POs)

**Status:** Not in current spec. The system assumes one invoice → one PO.

**When to implement:** Future phase. Would require matching logic changes in Stage 3a.

---

### Deferred: Configurable Flag → Verdict Routing (Per-Business Policy Dashboard)

**What this is:** Currently, which flag types produce `flag` vs `reject` is hardcoded in
`pipeline/nodes/decision.py` — only unexplained overage beyond 3× tolerance triggers `reject`,
everything else produces `flag`. Different businesses have materially different risk tolerances:
a high-volume retailer may want unapproved vendors to auto-reject; a startup may want even
tolerance overages to route to `flag` for human review rather than outright rejection.

**Proposed design:** A per-tenant policy table (Supabase row or JSON config) that maps each flag
`category` (from the taxonomy in phase_1.md §5) to a configurable verdict weight:
- `route_to_reject: true/false` — whether this flag type can trigger rejection
- `minimum_confidence_to_reject: float` — don't reject below this flag confidence threshold

The decision node reads the active policy at runtime and applies it instead of the hardcoded
precedence logic. A dashboard screen (Step 3–4 frontend) exposes these toggles per business.

**Why deferred:** Requires Supabase schema, a policy API, and frontend UI — all in Steps 2–4.
The current hardcoded logic correctly handles all 5 test cases per spec, so this is scope-additive.

**When to implement:** Step 2 (schema) + Step 4 (dashboard UI). Design the policy table during
Supabase schema design so the decision node can be parameterized cleanly from day one.

---

### Deviation #5 — Decision confidence uses weakest-flag rule, not weighted sum

**What was implemented:** `decision_confidence` is set to the lowest `flag_confidence` among all
raised flags. No flags → `high`. One low-confidence flag → entire decision is `low`.

**Why this is problematic:** A single marginal flag (e.g., a low-confidence duplicate check on a
very old near-match) collapses the overall confidence to `low` even when three other flags are
`high`. This is overly punitive and misleading to reviewers — the weakest signal dominates
regardless of how many strong signals agree.

**Better model:** Weighted sum (or average) of flag confidences, potentially weighted by flag
severity or category. For example:

```
decision_confidence = Σ (flag_confidence_score × flag_weight) / Σ flag_weights
```

Where `flag_weight` could be derived from flag category (financial discrepancy flags weighted
higher than data-quality flags) or from the configurable policy table above.

**Threshold mapping:** The resulting scalar maps to `low / medium / high` via configurable
thresholds (e.g., < 0.4 → low, 0.4–0.7 → medium, > 0.7 → high).

**Why deferred:** Requires defining flag weights (policy concern, not pure logic) and adds
complexity that doesn't change any of the 5 test outcomes today. Current weakest-flag rule is
a safe conservative default.

**When to implement:** Alongside the configurable policy dashboard above — flag weights belong in
the same per-tenant policy config. The two features are tightly coupled.
