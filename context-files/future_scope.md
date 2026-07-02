# PS-1 Invoice Processing — Future Scope Log

**Purpose:** This is a running log of everything deliberately deferred during scoping and build, organized by 
phase/step. Nothing here is forgotten — it's consciously out of scope for the one-week submission, kept visible 
so it can be referenced if asked "what would you do next?" in the live interview, or picked up later.

---

## Phase 1 — Problem Mapping

### Business Rules
- **Vendor unapproved + amount math edge case not explicitly tested**: the rule (unapproved vendor flags, and 
  can escalate to reject only if amount math independently fails) is defined but not exercised by a dedicated 
  test invoice in the trimmed Phase 2 set.
- **LLM-based reasoning for amount explanation checks**: deliberately deferred in favor of deterministic 
  line-item math for debuggability. A future version could use an LLM to catch explanations that don't reduce 
  cleanly to line-item math (e.g. a vendor note explaining a price increase in free text).
- **PO split across multiple invoices**: mentioned as a real-world scenario in the problem statement (a vendor 
  splitting one PO into multiple invoices, requiring cumulative billed-vs-PO tracking) but not built into the 
  matching logic or tested. Current matching logic assumes one invoice matches against one PO's full amount.
- **Multi-currency support**: schema and tolerance logic assume single-currency (USD) throughout. No FX handling.
- **Confidence roll-up nuance**: current decision_confidence roll-up is a simple "weakest link" rule. A more 
  sophisticated version could weight roll-up by number of flags or severity combinations, not just the single 
  lowest confidence flag.

### OCR / Extraction
- **OCR model/tool selection**: deferred at the time of the process map. Fallback *architecture* (structured 
  parse → detection check → OCR fallback) is locked; the specific OCR tool/model to use was not chosen at 
  that point (later resolved to use a fallback-based approach, tool TBD/tested during build).
- **Per-field extraction confidence**: spec allows for either per-field or overall extraction confidence. 
  Per-field (more granular, more useful for the dashboard) may be more build effort than overall — decide 
  during implementation based on time remaining.

---

## Phase 2 — Test Data Design

### Trimmed Edge Case Coverage
The following edge case *variants* were designed conceptually but trimmed from the actual 6-invoice test set 
to keep build scope tight for a one-week timeline. Rules are already defined in the Phase 1 spec — only the 
test coverage was trimmed:

- **Edge D — Implicit PO, weak signal**: vendor has multiple open POs, no strong corroborating signal → 
  should flag, low confidence. Not tested with a dedicated invoice.
- **Edge D — Implicit PO, near match within tolerance**: middle confidence tier of implicit matching, not tested.
- **Edge E — Unexplained overage, within tolerance→3x (flag, not reject)**: only the two extremes (explained, 
  and beyond-3x-reject) were built; the "flag but not reject" middle case for unexplained overage is defined 
  in rules but not tested with its own invoice.
- **Edge F — Fuzzy duplicate** (same vendor + amount, different invoice number, within 60-day window): only 
  the exact-invoice-number duplicate case was built. Fuzzy matching logic exists in the spec but isn't exercised 
  by a dedicated test invoice.
- **Unapproved vendor test case**: no dedicated invoice from a vendor absent from the approved list.

### Data Sourcing
- **Broader use of public invoice datasets** (Kaggle, HuggingFace) beyond the single scanned-invoice sample: 
  considered and deliberately declined in favor of self-generated data for precision/control. Could be 
  revisited if more realistic invoice *variety* (e.g. more vendor formatting styles) is wanted later — 
  candidates already identified: `mychen76/invoices-and-receipts_ocr_v1` (HF), `philschmid/pdf-samples` (HF).
- **PO dataset scale**: current plan is a small, hand-crafted PO dataset sized to match the 6 test invoices. 
  A larger, more realistic PO dataset (dozens/hundreds of POs) would better stress-test the implicit matching 
  logic (more ambiguity, more "multiple open POs" scenarios) but wasn't built for time reasons.

---

## Phase 3 — Build (to be updated during implementation)
*(Populate this section as build decisions are made — e.g. libraries swapped, shortcuts taken, logic simplified 
from spec for time.)*

---

## Phase 4 — Edge Cases + UI (to be updated during implementation)
*(Populate this section as UI/dashboard scope is finalized — e.g. features considered but cut, like filtering, 
search, or export from the dashboard.)*

---

## Phase 5 — Submission Prep (to be updated)
*(Populate this section with any last-minute scope cuts made to hit the Day 7 deadline.)*

---

## General / Cross-Cutting Future Improvements
- **Human-in-the-loop override workflow**: current spec produces a decision + reasoning trail, but there's no 
  built-in mechanism for a human to act on a "flag" (approve/reject it manually, with that override logged). 
  Worth considering as a v2 feature — closes the loop rather than just surfacing flags.
- **Learning from overrides**: if humans consistently override certain flag types (e.g. always approving a 
  specific vendor's "explained overage" flags), the system could eventually surface pattern suggestions 
  (e.g. "consider adding this vendor's freight charge as a standing exception"). Not in scope for v1.
- **Audit trail / persistence**: the spec defines the decision output shape but not long-term storage/audit 
  requirements (e.g. how long decisions + reasoning trails are retained, who can view them).