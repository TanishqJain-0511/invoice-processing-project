# CLAUDE.md — Invoice Processing Pipeline (PS-1)

This file is the persistent project context for Claude Code. Read it at the start of every session
before touching any code.

---

## Project Summary

A four-stage LangGraph pipeline that receives an invoice PDF and produces a structured
`approve / flag / reject` decision with a full human-readable reasoning trail. Built as a
technical case study submission.

**Reference date for all test data:** `2026-06-25` (hardcoded in tests and CLI default).

---

## Current Status

**Step 1 COMPLETE — 24/24 tests passing as of last run.**

```
✅ Invoice 1 — approve       (happy path, no flags)
✅ Invoice 2 — flag          (Implicit Match — Exact Details)
✅ Invoice 3 — flag          (Explained Overage)
✅ Invoice 4 — reject        (Unexplained Overage — Beyond 3× Tolerance)
✅ Invoice 5 — flag          (Exact Invoice Number Match)
```

Next: **Step 2 — FastAPI wrapper + Supabase integration**

---

## Spec Files (read these before any rule changes)

| File | Contents |
|------|----------|
| `context-files/phase_1.md` | Business rules, four-stage process map, output contract, flag taxonomy |
| `context-files/phase_2.md` | PO dataset, vendor list, invoice history, 5 test invoice specs + expected outcomes |
| `context-files/tech_stack.md` | Stack choices, architecture, build order, open decisions |

---

## Stack (all confirmed by user)

| Layer | Choice | Status |
|-------|--------|--------|
| Orchestration | LangGraph (StateGraph) | ✅ Built |
| AI Provider | OpenAI gpt-4o-mini (dev) / gpt-4o (demo) | ✅ Working |
| PDF fast path | pdfplumber | ✅ Built |
| OCR fallback | Docling | ⏳ Deferred (Edge Case A) |
| Schema validation | Pydantic v2 | ✅ Built |
| Backend | FastAPI (async) | ⏳ Step 2 |
| Database | Supabase Postgres | ⏳ Step 2 |
| Frontend | Next.js + Tailwind + shadcn/ui | ⏳ Step 3–4 |
| Deployment | Vercel (frontend) + Railway/Render (backend) | ⏳ Step 6 |

---

## Build Order

- [x] **Step 1** — LangGraph pipeline, local only. 24/24 tests passing. ✅ DONE
- [ ] **Step 2** — FastAPI wrapper + Supabase reference data + run persistence ← NEXT
- [ ] Step 3 — Next.js upload page + live run view
- [ ] Step 4 — Dashboard / history view
- [ ] Step 5 — Polish, error handling, loading states
- [ ] Step 6 — Deploy (Vercel + Railway/Render), re-test end-to-end
- [ ] Step 7 — Record demo

---

## Pipeline Architecture

```
extract → validate → [conditional] → match → decide → END
                           ↓ (if cannot proceed)
                         decide
```

**Nodes:**
- `pipeline/nodes/extraction.py` — Stage 1: pdfplumber → detection check → LLM structured output
- `pipeline/nodes/validation.py` — Stage 2: required fields, internal math check, date sanity
- `pipeline/nodes/matching.py` — Stage 3: PO match (3a), vendor check (3b), tolerance (3c), duplicate (3d)
- `pipeline/nodes/decision.py` — Stage 4: precedence logic, reasoning trail, confidence roll-up

**State:** `pipeline/state.py` — TypedDict with `Annotated[list, operator.add]` reducers for
`reasoning_trail` and `all_flags` (auto-accumulate across nodes without re-emitting full list).

**Graph:** `pipeline/graph.py` — `build_pipeline()` returns a compiled LangGraph app.

---

## Key Business Rules (do not change without updating spec files)

1. **Reject = one trigger only**: unexplained overage beyond 3× tolerance cap. Nothing else rejects.
2. **Implicit matches can NEVER approve**: even if all details match exactly (Invoice 2 case).
3. **Reject always carries a flag object**: `flags_raised` always explains why — never a bare verdict.
4. **Tolerance is asymmetric**: overages (invoice > PO) tolerated less strictly than underages.
5. **60-day duplicate window**: computed relative to `reference_date` (2026-06-25 for test data).
6. **Decision confidence roll-up**: weakest `flag_confidence` among all flags. No flags → high.
7. **Explanation check is deterministic**: pure line-item math, no LLM judgment (phase_1.md §3c).

---

## Tolerance Formula

**`tolerance = max(pct × po_total, dollar_floor)`**

Dollar figures in the table are FLOORS (minimums), not ceilings. Confirmed by phase_2.md Invoice 4:
PO-1005 ($2,000) → tier $1K–$10K → max(2%×$2,000, $150) = max($40, $150) = **$150** → 3×=$450.
Delta $500 > $450 → reject. Spec states "3× cap = $450" which requires max(), not min().

| Tier | Overage | Underage |
|------|---------|----------|
| < $1,000 | max(3% × PO, $30) | max(5% × PO, $50) |
| $1K–$10K | max(2% × PO, $150) | max(4% × PO, $300) |
| > $10K | max(1% × PO, $500) | max(3% × PO, $1,000) |

---

## Critical LLM Dependency — Invoice 2

Invoice 2 has internal job ref "Job Ref: CPD-JOB-5591" which must NOT be extracted as a PO number.
The extraction prompt explicitly guards this. If this ever starts failing, check the prompt in
`pipeline/nodes/extraction.py` → `_EXTRACTION_PROMPT` → rule #1 about `po_reference`.

---

## Test Data

All files in `test_data/` — do not modify.

| File | Purpose |
|------|---------|
| `po_dataset.json` | 6 PO records (PO-1002 = placeholder for deferred Edge A) |
| `approved_vendors.json` | 5 approved + 1 placeholder |
| `invoice_history.json` | 1 seed record (INV-7788, processed 2026-05-16) |
| `invoice_1_happy_path_INV-3001.pdf` | → approve |
| `invoice_2_edgeD_implicit_PO_INV-3003.pdf` | → flag (implicit match) |
| `invoice_3_edgeE_explained_overage_INV-3004.pdf` | → flag (explained overage) |
| `invoice_4_edgeE_unexplained_reject_INV-3005.pdf` | → reject |
| `invoice_5_edgeF_duplicate_INV-7788.pdf` | → flag (duplicate) |

---

## File Map

```
invoice-processing-project/
├── CLAUDE.md                   ← this file (Claude's persistent context)
├── understanding.md            ← human-readable project explanation
├── Future_Scope.md             ← deferred items + implementation deviations
├── pyproject.toml              ← dependencies (Python 3.11 required)
├── .env.example                ← env var template
├── .env                        ← actual secrets (gitignored)
├── run_pipeline.py             ← CLI: python run_pipeline.py <pdf_path>
├── context-files/              ← original spec docs (do not modify)
│   ├── phase_1.md
│   ├── phase_2.md
│   └── tech_stack.md
├── test_data/                  ← 5 PDFs + 3 reference JSONs (do not modify)
├── pipeline/
│   ├── models.py               ← Pydantic: InvoiceExtraction, Flag, DecisionOutput
│   ├── state.py                ← LangGraph TypedDict state definition
│   ├── graph.py                ← build_pipeline() — StateGraph wiring
│   ├── nodes/
│   │   ├── extraction.py       ← Stage 1: PDF parse + LLM extraction
│   │   ├── validation.py       ← Stage 2: field checks + math check + date check
│   │   ├── matching.py         ← Stage 3: PO match, vendor, tolerance, duplicates
│   │   └── decision.py         ← Stage 4: final decision + reasoning trail
│   └── utils/
│       ├── tolerance.py        ← tiered tolerance math (pure functions, unit-testable)
│       └── pdf_parser.py       ← pdfplumber wrapper + OCR detection check
└── tests/
    └── test_pipeline.py        ← 24 assertions across 5 invoices
```

---

## Python & Environment

```bash
# Python version (already set via pyproject local)
pyenv local 3.11.11

# Install dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run single invoice via CLI
python run_pipeline.py test_data/invoice_1_happy_path_INV-3001.pdf
```


**Required env vars** (in `.env`):
```
OPENAI_API_KEY=sk-proj-...
REFERENCE_DATE=2026-06-25
```

---

## Deferred (tracked in Future_Scope.md)

- Edge Case A — scanned invoice / OCR via Docling
- Unapproved vendor test case
- FastAPI backend, Supabase, Next.js frontend (Steps 2–4)
- PDF generation script (`scripts/generate_invoices.py`)
- Per-field extraction confidence (currently overall only)



InvoiceIQ Decision Report
========================
Decision: FLAG
Confidence: high
Invoice: invoice_1_happy_path_INV-3001.pdf
Vendor: Meridian Office Supplies
Amount: $4260.00
Matched PO: PO-1001
Run ID: 67040e53-be4c-4608-a23c-4078870d5c60

Summary: The invoice from Meridian Office Supplies for $4260.00 has been flagged due to Duplicate Detection concern. 1 issue was detected that require human review before payment can proceed.

Flags (1):
  - [HIGH] Exact Invoice Number Match: Invoice 'INV-3001' from vendor 'Meridian Office Supplies' was already processed on 2026-06-25 (0 days ago, within the 60-day window from 2026-06-25).