# PS-1 Invoice Processing — Tech Stack Spec
**Purpose of this document:** This defines the complete technology stack and architecture for the invoice
processing pipeline defined in `phase_1.md` (business rules/process logic) and `phase_2.md` (test data). It is
meant to be handed to a coding agent (Claude Code) as full context before implementation begins, alongside
those two files.

---

## 1. Guiding Principles Behind This Stack

- **Build the pipeline logic first, locally, before touching UI or deployment.** The hard part of this project
  is the four-stage decision pipeline (extraction → validation → matching → decision) — not the UI. Get that
  correct and testable against all 5 test invoices before wrapping it in any web layer.
- **Minimize deployed services.** Every additional independently-deployed service is a point of failure during
  the live interview demo. Keep the surface area small: frontend + backend + database, nothing more.
- **Use tools already proven in prior work**, not unfamiliar tools adopted purely for novelty. Orchestration,
  backend framework, and schema validation choices below all map directly to prior production experience.
- **No workflow-automation tool (e.g. n8n/Make/Zapier).** The core logic here is procedural, stateful decision
  logic (tiered tolerance math, confidence roll-ups, multi-signal matching) — this is naturally expressed as
  code, not as a node-based visual workflow. A workflow tool would either force this logic into an unnatural
  shape or reduce to a thin, valueless wrapper around a Python service. The case study explicitly allows
  "plain Python" as an equally valid choice — there is no grading benefit to using a workflow tool here.
- **Minimal AI/LLM footprint.** Per `phase_1.md`, decision logic is deterministic by design (line-item math,
  not LLM judgment). LLM usage is limited to extraction/field-mapping and the OCR fallback path. One provider
  is sufficient — no multi-provider dispatcher is needed for a single-user, one-week build.

---

## 2. Stack

| Layer                      | Choice                                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                   |
|----------------------------|------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Orchestration**          | LangGraph                                                                          | Four-stage pipeline (extraction → validation → matching → decision) maps directly onto a LangGraph state graph with clear node transitions and conditional edges (e.g. Stage 1's structured-parse-vs-OCR-fallback fork, Stage 3's PO-matching branches). Directly reuses prior experience (dual-agent LangGraph architecture, compliance convergence loop). |
| **Backend**                | FastAPI (async)                                                                    | Wraps the LangGraph pipeline behind REST endpoints. Async throughout for consistency with prior work (asyncpg, concurrent httpx ingestion patterns).                                                                                                                                                                                                        |
| **Schema / Validation**    | Pydantic                                                                           | All structured objects — `InvoiceExtraction`, match result, flag objects, final decision output — defined as Pydantic models per the schemas in `phase_1.md` Section 2. Used both for LLM structured-output extraction and for internal validation logic.                                                                                                   |
| **Extraction (fast path)** | Structured/text-based PDF parser (e.g. Docling or equivalent — see Open Decisions) | Primary extraction path for clean, machine-readable PDFs, per `phase_1.md` Stage 1.                                                                                                                                                                                                                                                                         |
| **Extraction (fallback)**  | OCR tool — **not yet finalized**, see Open Decisions                               | Triggered only when the fast-path detection check fails (empty/garbage text or missing critical fields), per `phase_1.md` Stage 1 design principle.                                                                                                                                                                                                         |
| **Database**               | Supabase (Postgres)                                                                | Stores: uploaded invoice files, PO dataset, approved vendor list, invoice history log (for duplicate detection), and run history/decision outputs (for the dashboard). Chosen for hosted Postgres + file storage with minimal setup friction; previously used in prior work.                                                                                |
| **Frontend**               | Next.js + Tailwind CSS + shadcn/ui                                                 | Two views required by the case study grading criteria: (1) a live run view showing each pipeline stage executing in real time, and (2) a dashboard showing run history, status, and outputs across runs.                                                                                                                                                    |
| **AI Provider**            | Single provider (OpenAI or Gemini — see Open Decisions)                            | Used for extraction field-mapping and OCR (if a vision-LLM-based OCR approach is chosen over a dedicated OCR engine). No multi-provider dispatcher — unnecessary complexity for this scope.                                                                                                                                                                 |
| **Deployment — Frontend**  | Vercel                                                                             | Standard Next.js deployment target, minimal config.                                                                                                                                                                                                                                                                                                         |
| **Deployment — Backend**   | Railway or Render                                                                  | Hosts the FastAPI + LangGraph service.                                                                                                                                                                                                                                                                                                                      |

**Explicitly excluded from this stack:** n8n / Make / Zapier (workflow automation tools), multi-provider LLM
dispatcher, any additional deployed orchestration service beyond frontend + backend + database.

---

## 3. Architecture Flow

```
[Next.js frontend]
  → Upload invoice PDF
  → POST to FastAPI backend
       ↓
[FastAPI backend]
  → Invokes LangGraph pipeline (stateful graph, 4 stages)
  → Streams stage-by-stage status back to frontend (for live run view)
       ↓
[LangGraph pipeline]
  Stage 1: Extraction (structured parse → detection check → OCR fallback)
  Stage 2: Internal Validation
  Stage 3: Matching (PO lookup/implicit match, vendor check, tolerance check, duplicate check)
  Stage 4: Decision (synthesis, reasoning trail, flags_raised)
       ↓
[Supabase]
  → Reads: po_dataset, approved_vendors, invoice_history (reference data from phase_2.md)
  → Writes: run record (decision output, reasoning trail, extracted data, flags) for dashboard/history
       ↓
[Next.js frontend]
  → Displays final decision + reasoning trail (live run view)
  → Dashboard queries Supabase for run history across all processed invoices
```

---

## 4. Local-First Build Order (see also revised timeline discussed separately)

1. Build and validate the LangGraph pipeline **locally**, no FastAPI/frontend/deployment yet — run it directly
   against the 5 test invoice PDFs and reference data from `phase_2.md`, confirm each produces its expected
   decision (per `phase_2.md` Section 3) before building anything else.
2. Wrap the validated pipeline in FastAPI endpoints, connect Supabase for reference data + run persistence.
3. Build the Next.js upload page + live run view.
4. Build the dashboard/history view.
5. Polish UI, error handling, loading states.
6. Deploy both services (Vercel + Railway/Render), re-test all 5 (or 6, if Edge A is resolved by then) invoices
   end-to-end in the deployed environment.
7. Record demo.

---

## 5. Open Decisions (not yet finalized — do not assume a default without flagging)

- **OCR tool for Stage 1 fallback**: not yet selected. Candidates previously discussed include Mistral OCR,
  Docling, or a vision-LLM-based approach (GPT-4o/Gemini vision). To be decided during Phase 3 build.
- **AI provider (OpenAI vs Gemini)**: not yet finalized.
- **Structured/text-based PDF parser for the extraction fast path**: likely Docling (prior proven use, 99%
  accuracy in similar work), but not explicitly re-confirmed for this project.
- **Edge Case A (scanned invoice)**: still deferred per `phase_2.md` Section 5. Once resolved, `po_dataset.json`
  and `approved_vendors.json` placeholder entries (PO-1002) need to be finalized, and the OCR fallback path
  needs a real test case exercising it.

---

## 6. Related Files
- `phase_1.md` — business rules, process map, output contract, flag taxonomy
- `phase_2.md` — PO dataset, approved vendor list, invoice history, test invoice specifications
- `Future_Scope.md` — deferred items across all phases (not required for build, but useful context for what was deliberately excluded and why)