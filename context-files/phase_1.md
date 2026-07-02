# PS-1 Invoice Processing — Phase 1 Spec
**Purpose of this document:** This is the complete problem definition, business rules, process map, and 
output contract for the invoice processing automation pipeline. It is meant to be handed to a coding agent 
(Claude Code) as full context before any implementation begins. Nothing here should require re-deriving decisions —
all judgment calls have already been made.

---

## 1. Problem Statement

A mid-size company receives vendor invoices as PDFs via email. Currently, an AP team member manually opens each 
invoice, finds the matching Purchase Order (PO) in a spreadsheet, checks whether the numbers line up, and decides 
whether to pay it. This is slow and error-prone, especially under fatigue/volume.

**Core challenges:**
- Invoices are inconsistently formatted across vendors — some are clean/machine-readable, some are scanned images
- Line items may be itemized or bundled; tax may be embedded or separate
- PO references may be explicit, implicit, or missing entirely
- Critical fields (invoice number, date, total) may be missing
- Matching invoices to POs isn't always exact — POs can be split across multiple invoices, amounts can be close-but-not-exact

**The system to build:** Given one invoice PDF + a PO dataset, produce a decision (approve / flag / reject) 
with a full, human-readable reasoning trail explaining exactly why — not a black-box verdict.

**What this is NOT:** A simple "read PDF → check number" script. This is a judgment-encoding system — 
turning tacit AP-analyst rules into explicit, explainable, deterministic logic.

---

## 2. Inputs & Outputs (System Contract)

### Inputs
1. **Invoice PDF** — single file, may be clean/machine-readable or scanned/image-based
2. **PO Dataset** — structured reference data (system of record). Each PO record includes at minimum:
   - `po_number`
   - `vendor_name`
   - `line_items[]` (description, quantity, unit price)
   - `po_total`
   - `status` (open / partially fulfilled / closed)
   - `date_issued`

### Output (single invoice → single decision object)
```json
{
  "decision": "approve" | "flag" | "reject",
  "decision_confidence": "high" | "medium" | "low",
  "extraction_confidence": "high" | "medium" | "low",
  "reasoning_trail": [
    "string — step-by-step human-readable log of every check performed and its result, in order"
  ],
  "extracted_data": {
    "vendor_name": "string",
    "invoice_number": "string | null",
    "invoice_date": "date | null",
    "line_items": [ { "description": "string", "quantity": "number", "unit_price": "number" } ],
    "subtotal": "number | null",
    "tax": "number | null",
    "total": "number | null",
    "po_reference": "string | null"
  },
  "matched_po": "string (PO number) | null",
  "flags_raised": [
    {
      "category": "string — see taxonomy in Section 5",
      "subcategory": "string — see taxonomy in Section 5",
      "flag_confidence": "high" | "medium" | "low",
      "detail": "string — specific human-readable explanation of this flag"
    }
  ]
}
```

**Note on `flags_raised` when decision is "reject":** `flags_raised` is populated even when `decision` is 
`"reject"` — the reject decision must carry its own flag object (see Section 5 taxonomy entry 
`Amount Discrepancy — Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)`) so the user always sees *why* 
a rejection happened, not just that it happened. Reject is never a bare/unexplained verdict.

**Two distinct confidence concepts — do not conflate:**
- `extraction_confidence` — how much the system trusts the *data pulled from the PDF* (extraction stage output)
- `decision_confidence` — how much the system trusts the *final verdict* (decision stage output), derived by 
- rolling up the confidence of every flag raised — if any flag is "low," decision confidence cannot be "high"

Each individual flag also carries its own `flag_confidence`, which is the input to the `decision_confidence` 
roll-up. Hierarchy: **Flag Confidence (per-issue) → rolls up into → Decision Confidence (per-invoice, final output)**.

---

## 3. Process Map — Four Stages

### Stage 1 — Extraction
**Input:** Raw invoice PDF
**Output:** `InvoiceExtraction` object (see schema above) + `extraction_confidence`

**Logic:**
1. Attempt structured/text-based PDF parse first (fast path).
2. **Detection check** — is extracted text empty, garbage, or missing critical fields entirely (no total, no vendor, no line items)?
   - No → proceed with structured parse result
   - Yes → **[Edge Case A]** route to OCR fallback, re-extract via OCR
3. Map raw text into the Pydantic extraction schema.
4. Attach `extraction_confidence` (per-field or overall) reflecting how cleanly data was pulled vs. inferred/uncertain.

**Design principle:** This must be a real fallback with an explicit detection step — not a blind try/except 
on file type. The detection step (garbage/empty text or missing critical fields → trigger OCR) is itself a 
designed decision point, not an implementation detail.

---

### Stage 2 — Internal Validation
**Input:** `InvoiceExtraction` object
**Output:** Validated extraction + list of validation issues (if any) + proceed/insufficient flag

**Logic:**
1. Required fields present check (vendor, invoice number, total — minimum viable set).
   - Missing critical field(s) → flag immediately (`Data Quality — Missing Critical Field`, high confidence); 
   - attempt matching anyway if enough data exists to try, otherwise skip straight to decision stage with 
   - insufficient-data flag.
2. Internal math check — do line items + tax sum to total within rounding margin?
   - Mismatch → flag (`Data Quality — Internal Math Inconsistency`, medium confidence). Note: this inconsistency 
   - may later explain a PO-amount delta in Stage 3, so pass it forward.
3. Date sanity check (not implausibly future-dated, not absurdly old).
4. Normalize fields (currency formatting, date formats) for downstream matching.

---

### Stage 3 — Matching
**Input:** Validated invoice data + PO dataset
**Output:** Match result object — matched PO (or null), match type + confidence, tolerance result, vendor status, 
duplicate status. All of these are carried forward as separate signals, not collapsed into one verdict yet.

**Logic:**

**3a. PO Matching**
- **Explicit PO reference present in invoice?**
  - Yes → direct lookup by PO number.
    - Found → proceed to 3c (amount comparison).
    - Not found in dataset → flag (`PO Matching — Referenced PO Not Found`, high confidence).
  - No → **[Edge Case D]** implicit matching:
    - Search PO dataset by vendor name.
    - **All details match exactly** (vendor, amount, line items — everything except PO number) → flag (`PO Matching`
    -- `— Implicit Match — Exact Details`, **high** confidence).
    - **Near match, within tolerance** → flag (`PO Matching — Implicit Match — Near Match`, **medium** confidence).
    - **Weak/ambiguous signal** (e.g. vendor-only, multiple open POs, no strong corroboration) → flag 
    -- (`PO Matching — Implicit Match — Weak Signal`, **low** confidence).
    - No plausible PO found at all → flag (`PO Matching — No Matching PO Found`, high confidence).
  - **Implicit matches can never result in "approve" — they always cap at "flag," regardless of confidence level.
  -- ** (Design principle: inferring the PO is inherently lower-trust than an explicit reference.)

**3b. Vendor Approval Check**
- Vendor on approved list?
  - Not approved → flag (`Vendor Validation — Unapproved Vendor`, high confidence). Carried forward — may escalate
  - to reject only if amount math independently triggers reject (see 3c). Unapproved vendor alone never results in reject.

**3c. Amount Comparison (tiered, asymmetric tolerance)**

| PO Amount        | Overage tolerance (invoice > PO) | Underage tolerance (invoice < PO) |
|------------------|----------------------------------|-----------------------------------|
| < $1,000         | 3%, capped at $30                | 5%, capped at $50                 |
| $1,000 – $10,000 | 2%, capped at $150               | 4%, capped at $300                |
| > $10,000        | 1%, capped at $500               | 3%, capped at $1,000              |

- **Within tolerance** → pass, no flag from this check.
- **Outside tolerance** → **[Edge Case E]** run explanation check:
  - **Deterministic line-item math**: does `po_total + candidate extra line item` (e.g. a freight/shipping/tax line 
  -- present on invoice but not on PO) ≈ `invoice_total`, within small margin?
  - **Explained** (math accounts for delta) → flag (`Amount Discrepancy — Explained Overage`, medium confidence). 
  -- Never escalates to reject, regardless of size.
  - **Unexplained, within tolerance → 3x tolerance cap** → flag (`Amount Discrepancy — Unexplained Overage`, medium confidence).
  - **Unexplained, beyond 3x tolerance cap** → **reject**, and this must ALSO raise a flag object 
  -- (`Amount Discrepancy — Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)`, high confidence) carrying 
  -- the specific detail (PO amount, invoice amount, delta, tolerance cap, multiple-of-tolerance it exceeded) so the 
  -- reasoning trail and `flags_raised` array always explain a rejection, never leave it bare. 
  -- (This is the *only* path in the entire system that can produce a reject decision.)
  - No LLM judgment in this check — line-item math only, deterministic and debuggable.

**3d. Duplicate Detection** (runs independently of match path, always executes)
- **[Edge Case F]**
- **Exact match**: same vendor + same invoice number found within last 60 days → flag (`Duplicate Detection — 
-- Exact Invoice Number Match`, high confidence).
- **Fuzzy match**: same vendor + same amount + invoice date within 60-day window (even if invoice number differs) → 
-- flag (`Duplicate Detection — Fuzzy Match`, low confidence).
- **Never auto-rejects** — duplicates always flag, human confirms before any money decision is blocked.
- **Assumption:** 60-day window chosen to reflect a typical billing/reconciliation cycle.

---

### Stage 4 — Decision
**Input:** All upstream signals — extraction confidence, validation issues, match result, tolerance result, 
vendor status, duplicate status
**Output:** Final decision object (full schema in Section 2)

**Decision precedence logic** (multiple flags can fire simultaneously — this is the synthesis rule):
- **Reject** fires if and only if: unexplained overage beyond 3x tolerance cap. Nothing else in the system can 
-- trigger reject. As noted in 3c, this always carries its own explanatory flag object — reject is never returned 
-- without a corresponding entry in `flags_raised` explaining exactly why.
- **Flag** fires if any of the following are true: implicit PO match (any confidence tier), 
-- unapproved vendor, duplicate (exact or fuzzy), unexplained overage within tolerance→3x, explained overage, 
-- missing critical field, low extraction confidence, internal math inconsistency, referenced PO not found, no matching PO found.
- **Approve** fires only if ALL of the following are true: explicit PO match found, vendor approved, 
-- amount within tolerance, no duplicate flags raised, extraction confidence is high, no validation issues.

**Design principle to preserve throughout implementation:** *Reject = the system is confident the money amount 
is wrong. Flag = something needs human eyes, but the system isn't confident enough to block it outright.* This is 
why reject has exactly one trigger path and everything else routes to flag. Regardless of which of the three 
decisions is reached, the user must always be able to see why — approve, flag, and reject all carry a full 
reasoning trail, and flag/reject additionally carry structured flag objects in `flags_raised`.

**Reasoning trail construction:** Build as an ordered list of every check performed and its result — not just 
the final verdict. Example:
> "Matched to PO-1042 (explicit reference). Vendor approved. Amount $10,150 vs PO $10,000 — within tier tolerance 
> (2%/$150 cap). No duplicate found in 60-day window. → Approved."

**Decision confidence roll-up:** Derived from the weakest (lowest) flag_confidence among all flags raised. 
If no flags raised → decision_confidence = high (approve case). If any flag is low confidence → decision_confidence 
cannot exceed low/medium regardless of other signals. For reject, decision_confidence reflects the confidence of 
the reject-trigger flag itself (high, per Section 5).

---

## 4. Edge Case → Stage Mapping

| Edge Case                         | Stage         | Fork Trigger                                                                         |
|-----------------------------------|---------------|--------------------------------------------------------------------------------------|
| **A — Scanned invoice**           | Extraction    | Structured parse fails detection check (empty/garbage text or                        |
|                                   |               | missing critical fields) → OCR fallback                                              |
| **D — Implicit PO reference**     | Matching (3a) | No explicit PO number in invoice → vendor-based inference                            |
|                                   |               | with 3-tier confidence (exact/near/weak)                                             |
| **E — Gray-zone amount mismatch** | Matching (3c) | Amount outside tolerance → deterministic line-item explanation                       |
|                                   |               | check → flag (explained/unexplained-within-3x) or reject (unexplained-beyond-3x),    |
|                                   |               | with reject always accompanied by its own explanatory flag object                    |
| **F — Duplicate invoice**         | Matching (3d) | Runs independently every time — exact invoice-number check +                         |
|                                   |               | fuzzy vendor/amount/date check against 60-day window                                 |

---

## 5. Flag Taxonomy (Category / Subcategory / Confidence)

| Category                  | Subcategory                                                  | Flag Confidence |
|---------------------------|--------------------------------------------------------------|-----------------|
| **PO Matching**           | Implicit Match — Exact Details                               | High            |
|                           | Implicit Match — Near Match (within tolerance)               | Medium          |
|                           | Implicit Match — Weak Signal                                 | Low             |
|                           | Referenced PO Not Found                                      | High            |
|                           | No Matching PO Found                                         | High            |
| **Amount Discrepancy**    | Explained Overage (line-item accounted, e.g. freight)        | Medium          |
|                           | Unexplained Overage (within tolerance → 3x)                  | Medium          |
|                           | Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)   | High            |
| **Vendor Validation**     | Unapproved Vendor                                            | High            |
| **Duplicate Detection**   | Exact Invoice Number Match                                   | High            |
|                           | Fuzzy Match (vendor + amount + date, 60-day window)          | Low             |
| **Data Quality**          | Missing Critical Field                                       | High            |
|                           | Low Extraction Confidence                                    | Medium          |
|                           | Internal Math Inconsistency (line items ≠ total)             | Medium          |

**Note:** "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)" is included in this table (Amount 
Discrepancy category) specifically so that a rejection is never a bare verdict — it always produces a flag object 
in `flags_raised` alongside the `"reject"` decision, carrying the specific detail (amounts, delta, tolerance cap, 
multiple exceeded) so the user always knows exactly why the invoice was rejected, not just that it was.

---

## 6. Explicit Assumptions (for reference during live interview / demo)

- Duplicate detection window: **60 days**, chosen to reflect a typical AP billing/reconciliation cycle.
- Tolerance is asymmetric: overages (invoice > PO) are treated more strictly than underages (invoice < PO), 
-- since overages carry overpayment risk.
- Explanation checks for amount discrepancies are deterministic (line-item math), not LLM-judged — chosen 
-- for debuggability and defensibility over flexibility.
- Implicit PO matches can never reach "approve," regardless of confidence — inferred matches are inherently 
-- lower-trust than explicit references.
- Reject is reserved exclusively for confidently-wrong amount math (unexplained overage beyond 3x tolerance cap) — 
-- every other failure mode routes to flag, preserving a human-in-the-loop for anything the system isn't fully certain about.
- Reject always carries an explanatory flag object — the user is never shown a rejection without a specific, 
-- structured reason attached (category, subcategory, confidence, and detail), consistent with the system's 
-- overall commitment to a visible reasoning trail rather than a black-box verdict.

---

## 7. Not Yet Decided (deferred to later phases)

- OCR model/tool selection for Stage 1 fallback (deferred — fallback architecture is locked, specific tool is not)
- PO dataset schema finalization + sample data generation (Phase 2)
- Tech stack for orchestration/UI (not yet discussed)