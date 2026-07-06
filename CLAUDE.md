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

**Steps 1–7 COMPLETE.** Pipeline (24/24 tests), FastAPI + Supabase backend, Next.js frontend
(enterprise UI overhaul), and deployment are all done and live:

- Frontend: https://invoice-processing-project.vercel.app
- Backend:  https://invoice-processing-project-production.up.railway.app (docs at `/docs`)

```
✅ Invoice 1 — approve       (happy path, no flags)
✅ Invoice 2 — flag          (Implicit Match — Exact Details)
✅ Invoice 3 — flag          (Explained Overage)
✅ Invoice 4 — reject        (Unexplained Overage — Beyond 3× Tolerance)
✅ Invoice 5 — flag          (Exact Invoice Number Match)
```

**Live demo gotcha:** every successful run through `/api/process` appends to Supabase's
`invoice_history` table, so re-running the same test PDF across sessions eventually makes it
flag itself as a duplicate. Before recording a demo, reset via `demo data/reset.sql` in the
Supabase SQL editor — see `demo data/README.md` for the full pre-recording checklist.

Next: **Step 8 — Demo recording**

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
| Backend | FastAPI (async) | ✅ Built — `backend/api/` |
| Database | Supabase Postgres | ✅ Built — schema/seed in `db/` |
| Frontend | Next.js 16 + Tailwind + shadcn/ui | ✅ Built — `frontend/` |
| Deployment | Vercel (frontend) + Railway (backend) | ✅ Done — live URLs above |

---

## Build Order

- [x] Step 1 — LangGraph pipeline, local only. 24/24 tests passing.
- [x] Step 2 — FastAPI wrapper + Supabase reference data + run persistence.
- [x] Step 3 — Next.js upload page + live run view.
- [x] Step 4 — Dashboard / history view.
- [x] Step 5 — Polish, error handling, loading states.
- [x] Step 6 — Deploy (Vercel + Railway), re-tested end-to-end.
- [x] Step 7 — Full UI overhaul (enterprise design system).
- [ ] **Step 8** — Record demo ← NEXT (see `demo data/README.md`)

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
├── understanding.md            ← human-readable project explanation (kept current — check here first)
├── Future_Scope.md             ← deferred items + implementation deviations
├── context-files/              ← original spec docs (do not modify)
│   ├── phase_1.md
│   ├── phase_2.md
│   ├── phase_2_extended_testing.md
│   └── tech_stack.md
├── demo data/                  ← self-contained demo kit: 5 PDFs, reference JSON, reset.sql, checklist
├── db/
│   ├── schema.sql               ← Supabase table definitions
│   └── seed.sql                 ← reference data load (POs, vendors, invoice history)
├── backend/                     ← Python: pipeline + FastAPI server
│   ├── pyproject.toml
│   ├── .env / .env.example      ← OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
│   ├── run_pipeline.py          ← CLI: python run_pipeline.py <pdf_path>
│   ├── test_data/               ← 5 PDFs + 3 reference JSONs (do not modify)
│   ├── tests/
│   │   └── test_pipeline.py     ← 24 assertions across 5 invoices
│   ├── pipeline/
│   │   ├── models.py            ← Pydantic: InvoiceExtraction, Flag, DecisionOutput
│   │   ├── state.py             ← LangGraph TypedDict state definition
│   │   ├── graph.py             ← build_pipeline() — StateGraph wiring
│   │   ├── nodes/
│   │   │   ├── extraction.py    ← Stage 1: PDF parse + LLM extraction
│   │   │   ├── validation.py    ← Stage 2: field checks + math check + date check
│   │   │   ├── matching.py      ← Stage 3: PO match, vendor, tolerance, duplicates
│   │   │   └── decision.py      ← Stage 4: final decision + reasoning trail
│   │   └── utils/
│   │       ├── tolerance.py     ← tiered tolerance math (pure functions, unit-testable)
│   │       └── pdf_parser.py    ← pdfplumber wrapper + OCR detection check
│   └── api/
│       ├── main.py              ← FastAPI: POST /api/process, GET /api/runs, GET /api/runs/{id}
│       ├── db.py                ← Supabase client singleton
│       └── schemas.py           ← Pydantic response models
└── frontend/                    ← Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui)
    └── src/app/                 ← dashboard, upload, runs, config, admin, help, login
```

See `understanding.md` for the full annotated frontend component tree and run instructions —
it's kept up to date; this file's map is the quick-reference version.

---

## Python & Environment (all commands run from `backend/`)

```bash
# Python version (already set via pyproject local)
pyenv local 3.11.11

# Install dependencies
pip install -e ".[dev]"

# Run tests
cd backend && pytest tests/ -v

# Run single invoice via CLI
cd backend && python run_pipeline.py test_data/invoice_1_happy_path_INV-3001.pdf

# Start the FastAPI backend
cd backend && uvicorn api.main:app --reload   # → http://localhost:8000

# Start the Next.js frontend
cd frontend && npm run dev                     # → http://localhost:3000
```

**Required env vars** (in `backend/.env`):
```
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
# REFERENCE_DATE=2026-06-25   (optional, CLI only)
```

---

## Deferred (tracked in Future_Scope.md)

- Edge Case A — scanned invoice / OCR via Docling
- Unapproved vendor test case
- PDF generation script (`scripts/generate_invoices.py`)
- Per-field extraction confidence (currently overall only)