# Understanding the Invoice Processing Pipeline

This document explains the project in plain English — what it does, why each piece
exists, and how everything fits together. Read this to get your bearings before
diving into the code.

---

## The Problem Being Solved

A company receives vendor invoices as PDFs. An AP (Accounts Payable) team member
manually:
1. Opens the invoice PDF
2. Finds the matching Purchase Order (PO) in a spreadsheet
3. Checks whether the numbers match
4. Decides whether to approve payment

This is slow, error-prone under fatigue, and doesn't scale. The goal is to
**automate this judgment** — not as a black box, but as a transparent, explainable
system that tells you exactly why it made each decision.

---

## What the System Does

Given one invoice PDF, it produces a **decision object** that contains:

- **Decision**: `approve`, `flag`, or `reject`
- **Reasoning trail**: a step-by-step log of every check performed, in plain English
- **Flags raised**: structured list of issues found, each with a category and confidence
- **Extracted data**: what was pulled from the PDF (vendor, total, line items, etc.)
- **Matched PO**: which Purchase Order this invoice was matched to

The key insight: **every decision, including approve, comes with a full explanation**.
This is a reasoning system, not a magic button.

---

## The Four Stages

The pipeline runs in four sequential stages. Think of it as a checklist that builds
confidence (or flags issues) as it goes.

### Stage 1 — Extraction
**What:** Read the PDF and pull out structured data.

**How:** First tries plain text extraction (fast, works for clean PDFs). If that
fails (scanned/image-based invoice), falls back to OCR. Then sends the raw text to
GPT-4o-mini with a carefully written prompt, which returns structured fields:
vendor name, invoice number, date, line items, totals, and any PO reference.

**Key output:** An `InvoiceExtraction` object + `extraction_confidence` (high/medium/low).

**Important:** The LLM is instructed that a "PO reference" is ONLY something explicitly
labeled as a Purchase Order number — not job references, work order numbers, etc.

---

### Stage 2 — Internal Validation
**What:** Check the extracted data makes sense on its own, before comparing to any PO.

**Three checks:**
1. **Required fields**: Are vendor name, invoice number, and total all present?
2. **Internal math**: Does `sum(line items) + tax = total`? If not, the invoice's
   own numbers don't add up — flagged as a data quality issue.
3. **Date sanity**: Is the date not absurdly in the future or extremely old?

**Key output:** A list of validation flags + a `can_proceed` signal. If the data is
too sparse to match against anything (missing both vendor and total), the pipeline
skips Stage 3 and goes straight to Stage 4.

---

### Stage 3 — Matching
**What:** Compare the invoice against the PO dataset and run four independent checks.

**3a — PO Matching:**
- If the invoice has an explicit PO number → look it up directly.
  - Found → proceed. Not found → flag "Referenced PO Not Found".
- If no PO number → try to infer it (implicit matching):
  - All details match exactly (vendor + total + line items) → flag "Implicit Match — Exact Details" (high confidence)
  - Vendor + amount within tolerance → flag "Implicit Match — Near Match" (medium)
  - Only vendor matches → flag "Implicit Match — Weak Signal" (low)
  - No match at all → flag "No Matching PO Found"
- **Critical rule**: Implicit matches can NEVER approve, regardless of how well they match.
  Inferring the PO is inherently less trustworthy than an explicit reference.

**3b — Vendor Check:**
Is the vendor on the approved vendor list? If not → flag "Unapproved Vendor".
Importantly, an unapproved vendor alone never triggers a reject — it always flags for human review.

**3c — Amount Comparison (tiered tolerance):**
Compares the invoice total to the PO total. The allowed variance depends on the PO size:

| PO Amount      | Max overage allowed  | Max underage allowed   |
|----------------|----------------------|------------------------|
| Under $1,000   | larger of 3% or $30  | larger of 5% or $50    |
| $1,000–$10,000 | larger of 2% or $150 | larger of 4% or $300   |
| Over $10,000   | larger of 1% or $500 | larger of 3% or $1,000 |

Overages (invoice > PO) are tolerated less than underages because overages mean overpaying.

If the amount is outside tolerance, the system runs an **explanation check**:
does the delta exactly equal a line item on the invoice that doesn't exist on the PO
(e.g. a freight charge)? If yes → "Explained Overage" (flags for review, but never rejects).
If no explanation and the gap is more than 3× the tolerance cap → **REJECT** (the only
reject trigger in the entire system). If unexplained but within 3× cap → "Unexplained Overage" (flag only).

**3d — Duplicate Detection:**
Checks a 60-day history log of already-processed invoices:
- Same vendor + same invoice number → "Exact Invoice Number Match" (high confidence)
- Same vendor + same amount + date in window → "Fuzzy Match" (low confidence)
Duplicates always flag, never auto-reject.

---

### Stage 4 — Decision
**What:** Synthesize all signals into a final verdict.

**Precedence rules (strict order):**
1. **Reject** — only if the reject trigger flag from Stage 3c exists (Unexplained overage greater than 3x tolerance)
2. **Flag** — if any flag was raised (and no reject trigger)
3. **Approve** — only if ALL of: explicit PO match, approved vendor, amount within
   tolerance, no duplicates, no validation issues, high extraction confidence

**Confidence roll-up:** The overall `decision_confidence` equals the weakest
`flag_confidence` among all flags. If no flags → high confidence. One low-confidence
flag → the whole decision is low confidence.

**Reasoning trail:** An ordered log of every check from all four stages is attached
to the output. You can read exactly why the system decided what it decided.

---

## The 5 Test Invoices

These are the test cases that prove the pipeline works. Each one is designed to
exercise exactly one distinct rule or edge case.

### Invoice 1 — Happy Path (`invoice_1_happy_path_INV-3001.pdf`)
**Vendor:** Meridian Office Supplies | **PO:** PO-1001 | **Total:** $4,260

The invoice has a $60 freight charge not on the PO. PO total is $4,200.
Delta = $60. For the $1K–$10K tier, tolerance = max(2%×$4,200, $150) = $150.
$60 < $150 → within tolerance. Everything else checks out.
**Expected: approve, no flags, high confidence.**

---

### Invoice 2 — Implicit PO (`invoice_2_edgeD_implicit_PO_INV-3003.pdf`)
**Vendor:** Coastal Print & Design | **No PO number** | **Total:** $2,650

The invoice has an internal reference "Job Ref: CPD-JOB-5591" but no PO number.
The pipeline must NOT mistake this for a PO reference. All invoice details match
PO-1003 exactly (same vendor, same total, same line items).
**Expected: flag (Implicit Match — Exact Details, high confidence).**
Even a perfect implicit match cannot approve — that's a hard rule.

---

### Invoice 3 — Explained Overage (`invoice_3_edgeE_explained_overage_INV-3004.pdf`)
**Vendor:** Harbor Logistics Parts | **PO:** PO-1004 | **Total:** $13,100

PO total is $12,500. Invoice adds a freight line of $600 that's not on the PO.
Delta = $600. Tolerance for >$10K tier = max(1%×$12,500, $500) = $500. $600 > $500
→ outside tolerance. But: $12,500 (PO) + $600 (freight line) = $13,100 exactly.
Delta is fully explained → never reject.
**Expected: flag (Explained Overage, medium confidence).**

---

### Invoice 4 — Reject (`invoice_4_edgeE_unexplained_reject_INV-3005.pdf`)
**Vendor:** Silverline Manufacturing | **PO:** PO-1005 | **Total:** $2,500

PO total is $2,000. The invoice silently inflates the unit price from $50 to $62.50
(same quantity, no extra line items, no note). Delta = $500. Tolerance for $1K–$10K
tier = max(2%×$2,000, $150) = $150. 3× cap = $450. $500 > $450, and no line-item
math explains the gap.
**Expected: reject + explanatory flag with full detail (PO amount, invoice amount,
delta, tolerance cap, multiple exceeded).**

---

### Invoice 5 — Duplicate (`invoice_5_edgeF_duplicate_INV-7788.pdf`)
**Vendor:** Global Parts Co. | **PO:** PO-1007 | **Invoice #:** INV-7788

Everything about this invoice is clean — correct PO, correct amount, approved vendor.
The only issue: the same vendor + invoice number already exists in the invoice history
log, processed on 2026-05-16 (40 days before the reference date 2026-06-25, within
the 60-day window).
**Expected: flag (Exact Invoice Number Match, high confidence).** Duplicates are
never auto-rejected — a human must confirm before blocking payment.

---

## How the Code Is Organized

```
invoice-processing-project/
├── backend/                    ← Python: pipeline + FastAPI server
│   ├── pyproject.toml          Dependencies (LangGraph, FastAPI, Supabase, etc.)
│   ├── run_pipeline.py         CLI: python run_pipeline.py <pdf>
│   ├── pipeline/
│   │   ├── models.py           All data structures (InvoiceExtraction, Flag, DecisionOutput)
│   │   ├── state.py            The shared state dict that flows through all four stages
│   │   ├── graph.py            LangGraph wiring — connects the four nodes
│   │   ├── nodes/
│   │   │   ├── extraction.py   Stage 1
│   │   │   ├── validation.py   Stage 2
│   │   │   ├── matching.py     Stage 3 (all four sub-checks)
│   │   │   └── decision.py     Stage 4
│   │   └── utils/
│   │       ├── tolerance.py    Pure math functions for the tiered tolerance table
│   │       └── pdf_parser.py   PDF text extraction + OCR detection check
│   ├── api/
│   │   ├── main.py             FastAPI app: POST /api/process, GET /api/runs, GET /api/runs/{id}
│   │   ├── db.py               Supabase client singleton
│   │   └── schemas.py          Pydantic request/response models
│   ├── test_data/              5 test PDFs + 3 reference JSONs
│   └── tests/
│       └── test_pipeline.py    24 integration tests (still pass, load from local JSON)
├── frontend/                   ← Next.js 16 app (TypeScript + Tailwind + shadcn/ui)
│   └── src/
│       ├── app/
│       │   ├── page.tsx        Upload page: drag & drop + live stage animation
│       │   └── runs/[id]/
│       │       └── page.tsx    Run detail: decision banner, flags, stages, extracted data
│       ├── components/
│       │   ├── StageCard.tsx   Stage card (pending/running/done states)
│       │   └── DecisionBadge.tsx  Colored approve/flag/reject badge
│       └── lib/
│           └── api.ts          Typed fetch client for the FastAPI backend
└── db/
    ├── schema.sql              CREATE TABLE for 4 Supabase tables
    └── seed.sql                INSERT for POs, vendors, invoice history
```

The **state** object (`backend/pipeline/state.py`) is a dictionary that flows through all
four nodes. Each node reads what it needs and writes its outputs. Two fields
(`reasoning_trail` and `all_flags`) automatically accumulate across nodes using
LangGraph's reducer pattern — each node just appends its new entries.

---

## How to Run It

**Run all tests (from backend/):**
```bash
cd backend && pytest tests/ -v
```

**Run a single invoice via CLI (from backend/):**
```bash
cd backend && python run_pipeline.py test_data/invoice_1_happy_path_INV-3001.pdf
```

**Start the FastAPI backend (from backend/):**
```bash
cd backend && uvicorn api.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (interactive Swagger UI)
```

**Start the Next.js frontend (from frontend/):**
```bash
cd frontend && npm run dev
# → http://localhost:3000
```

**Test the API directly:**
```bash
curl -F "file=@backend/test_data/invoice_1_happy_path_INV-3001.pdf" \
     -F "reference_date=2026-06-25" \
     http://localhost:8000/api/process
```

---

## Build Progress

| Step    | What                                 | Status  |
|---------|--------------------------------------|---------|
| Step 1  | LangGraph pipeline, 24/24 tests      | ✅ Done  |
| Step 2  | FastAPI backend + Supabase           | ✅ Done  |
| Step 3  | Next.js upload page + live run view  | ✅ Done  |
| Step 4  | Dashboard / history view             | ✅ Done  |
| Step 5  | Polish                               | ✅ Done  |
| Step 6  | Deploy (Vercel + Railway)            | ✅ Done  |
| Step 7  | Demo recording                       | ⏳ Final |

## Step 2 — What Was Built (FastAPI + Supabase)

The pipeline is wrapped in a FastAPI server. Three endpoints:

- `POST /api/process` — accepts a PDF (multipart upload), loads reference data from
  Supabase, runs the full four-stage pipeline, stores the result, and returns the
  full decision output including reasoning trail and flags.
- `GET /api/runs` — returns a list of all past runs, newest first (for the dashboard).
- `GET /api/runs/{id}` — full detail for one run.

Supabase stores four tables:
- `purchase_orders` — PO reference data (seeded from test_data/)
- `approved_vendors` — vendor approval list
- `invoice_history` — duplicate-detection history (grows with each processed invoice)
- `pipeline_runs` — every run's full output (decision, flags, reasoning trail, extracted data)

PDF files are stored in a Supabase Storage bucket (`invoices`), with the URL
persisted in `pipeline_runs.invoice_file_path`.

## Step 3 — What Was Built (Next.js Frontend)

Two pages:

**`/` (Upload page)**
- Drag-and-drop or click-to-browse PDF upload
- Optional reference date field (default 2026-06-25 for test data)
- After clicking "Process Invoice", shows four animated stage cards while the API
  call is in flight: pending → running → done, ticking through each stage on a timer
- On success, redirects to `/runs/{id}` with the result

**`/runs/[id]` (Run detail)**
- Decision banner (green/amber/red) with confidence indicators and matched PO
- Flags section: each flag with confidence badge, category, subcategory, and detail text
- Pipeline stages breakdown: reasoning trail lines grouped by stage (Stage 1–4)
- Extracted data: vendor, invoice number, date, total, tax, subtotal, PO reference,
  and a line items table with per-item totals

## Step 4 — What Was Built (Dashboard / History View)

**`/runs` (Dashboard)**
- Stats row: total runs · approved count · flagged count · rejected count
- Table of all past runs, newest first: filename, decision badge, matched PO,
  confidence, date + time — each row links to `/runs/{id}`
- Empty state with link to upload when no runs exist
- Shared navigation header added to root layout (Upload · History links on every page)
- Bug fix: `invoice_history.processed_date` now uses `ref_date` (not real today) so
  duplicate detection stays consistent with test reference date; duplicates no longer
  added to history a second time

---

## Step 5 — What Was Built (Polish)

- **NavBar** (`components/NavBar.tsx`) — `'use client'`, `usePathname()` for active link detection (Upload / History), sticky top nav on every page
- **RunsTable** (`components/RunsTable.tsx`) — `'use client'`, full-row click via `useRouter` navigates to `/runs/{id}`
- **Loading skeletons** — `runs/loading.tsx` and `runs/[id]/loading.tsx` — animated pulse layouts that display while server components fetch data
- **Not-found page** — `app/not-found.tsx` — styled 404 with link back to history
- Upload page trimmed: removed redundant h1, adjusted min-height

---

## Step 6 — What Was Built (Deploy)

### Files created

| File | Purpose |
|------|---------|
| `backend/Procfile` | Railway start command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
| `backend/railway.toml` | Nixpacks builder config + restart policy |
| `backend/.python-version` | Pins Python 3.11.11 for Railway's Nixpacks builder |
| `backend/.env.example` | Documents required env vars for Railway |
| `.gitignore` | Prevents `.env`, `node_modules/`, `__pycache__/`, `.next/`, etc. from being committed |

### Changes

- **CORS** (`api/main.py`) — `CORS_ORIGINS` env var (comma-separated), defaults to `*` for dev. Set to your Vercel URL in Railway's env config.
- **API fallback** (`app/page.tsx`) — `NEXT_PUBLIC_API_URL ?? "http://localhost:8000"` so it doesn't break if the env var is missing locally.
- Added `GET /health` endpoint to FastAPI for Railway liveness checks.

### Deploy: Backend → Railway

1. Push to GitHub (Railway deploys from a Git repo)
2. In Railway dashboard: **New Project → Deploy from GitHub repo**
3. Select the repo. Set **Root Directory** → `backend/`
4. Add environment variables:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `CORS_ORIGINS` = `https://your-app.vercel.app` (fill in after Vercel deploy)
5. Railway auto-detects Nixpacks + `pyproject.toml`, installs deps, starts the server
6. Copy the Railway service URL (e.g. `https://invoice-api-xxxx.up.railway.app`)

### Deploy: Frontend → Vercel

1. In Vercel dashboard: **Add New Project → Import Git Repository**
2. Set **Root Directory** → `frontend/`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Railway backend URL
4. Click **Deploy**
5. Copy the Vercel URL, go back to Railway and set `CORS_ORIGINS` to the Vercel URL, then redeploy

---

## Key Design Decisions Worth Knowing

**Why LangGraph?** The four-stage pipeline with conditional routing (skip matching
if data is too sparse) maps naturally onto a state graph. It also makes the live
run view easier to build later — each node execution can stream status to the frontend.

**Why is reject so hard to trigger?** By design. The system is conservative — it
only blocks payment when it's mathematically certain the amount is wrong and
unexplained. Everything else routes to "flag" for a human to decide. This preserves
human judgment for ambiguous cases.

**Why is the explanation check deterministic (not LLM-based)?** Because in an AP
context, "this freight charge explains the delta" needs to be auditable and
reproducible. An LLM might give different answers on different days. Pure math
(does PO total + extra line items = invoice total, within $0.02?) is always the
same and always debuggable.

**Why is the tolerance formula `max(%, floor)` not `min(%, cap)`?** The dollar
figures in the tolerance table behave as minimum guaranteed tolerances, not maximum
limits. This was confirmed by the spec's own worked example for Invoice 4: the spec
explicitly states "3× cap = $450", which only makes sense if the $150 is a floor
(max(2%×$2,000, $150) = $150), not a ceiling (min(2%×$2,000, $150) = $40 → 3×=$120).
