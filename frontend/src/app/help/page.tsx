import Link from "next/link";
import {
  FileText,
  Cpu,
  ShieldCheck,
  GitMerge,
  Scale,
  ChevronRight,
  Upload,
  BookOpen,
  Keyboard,
  HelpCircle,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionCard from "@/components/shared/SectionCard";

const PIPELINE_STAGES = [
  {
    index: 1,
    name: "Extraction",
    icon: Cpu,
    color: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", iconText: "text-blue-500" },
    description: "The uploaded PDF is parsed using pdfplumber to extract raw text. If the document is text-based, this succeeds immediately. The raw text is then sent to GPT-4o mini with a strict structured-output prompt that extracts: vendor name, invoice number, invoice date, PO reference, line items, subtotal, tax, and total.",
    outputs: ["vendor_name", "invoice_number", "invoice_date", "po_reference", "line_items[]", "subtotal", "tax", "total"],
  },
  {
    index: 2,
    name: "Validation",
    icon: ShieldCheck,
    color: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", iconText: "text-violet-500" },
    description: "The extracted data is validated against three checks: required fields (vendor name, total), internal math consistency (line items must sum to stated total), and date sanity (invoice date must not be in the future relative to the reference date). Validation failures are collected as flags but don't stop the pipeline.",
    outputs: ["validation_flags", "can_proceed_to_matching"],
  },
  {
    index: 3,
    name: "Matching",
    icon: GitMerge,
    color: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", iconText: "text-amber-500" },
    description: "Four sub-checks run in sequence: (3a) PO matching — looks up the referenced PO or finds an implicit match by vendor name; (3b) Vendor validation — checks if the vendor is on the approved list; (3c) Tolerance check — compares invoice total to PO total using tiered tolerance thresholds; (3d) Duplicate detection — scans the invoice history for the same invoice within a 60-day window.",
    outputs: ["matched_po", "vendor_flags", "tolerance_flags", "duplicate_flags"],
  },
  {
    index: 4,
    name: "Decision",
    icon: Scale,
    color: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", iconText: "text-emerald-500" },
    description: "All flags are evaluated against the decision precedence rules. A single hardcoded reject trigger exists: unexplained overage beyond 3× the tolerance cap. All other issues produce a 'flag' outcome. If no flags exist, the decision is 'approve'. Confidence is calculated as the weakest flag confidence among all raised flags.",
    outputs: ["decision", "decision_confidence", "reasoning_trail"],
  },
];

const BUSINESS_RULES = [
  {
    rule: "Reject = one trigger only",
    desc: "Only an unexplained overage beyond 3× the tolerance cap produces a reject. Nothing else.",
    severity: "Critical",
  },
  {
    rule: "Implicit matches can never approve",
    desc: "Even if all invoice details exactly match a PO, an implicit match (no PO number) is always flagged.",
    severity: "Important",
  },
  {
    rule: "Tolerance is asymmetric",
    desc: "Overages (invoice > PO) are less tolerant than underages (invoice < PO).",
    severity: "Important",
  },
  {
    rule: "60-day duplicate window",
    desc: "Duplicate detection scans the last 60 days relative to the reference date.",
    severity: "Standard",
  },
  {
    rule: "Confidence roll-up",
    desc: "Overall confidence is the weakest flag confidence. No flags means high confidence.",
    severity: "Standard",
  },
];

const TOLERANCE_TIERS = [
  { tier: "< $1,000", overage: "max(3% × PO, $30)", underage: "max(5% × PO, $50)" },
  { tier: "$1K–$10K", overage: "max(2% × PO, $150)", underage: "max(4% × PO, $300)" },
  { tier: "> $10K", overage: "max(1% × PO, $500)", underage: "max(3% × PO, $1,000)" },
];

const FAQS = [
  {
    q: "What invoice formats are supported?",
    a: "PDF files only. Native digital PDFs work best. Scanned invoices are supported but require clear, high-resolution scans for accurate extraction.",
  },
  {
    q: "Why does the reference date matter?",
    a: "The reference date is used to calculate the 60-day duplicate detection window. In production it defaults to today. Use 2026-06-25 when testing with the provided test invoices.",
  },
  {
    q: "What's the difference between Flag and Reject?",
    a: "A flagged invoice requires human review — the AP clerk must manually approve or reject it. A rejected invoice has a critical discrepancy (overage beyond 3× tolerance) and must be corrected by the vendor before resubmission.",
  },
  {
    q: "Can I change which flags trigger a rejection?",
    a: "Yes — on the Settings page you can escalate any flag type from FLAG to REJECT. The 3× overage trigger is hardcoded and cannot be changed.",
  },
  {
    q: "What happens if the PDF can't be read?",
    a: "If pdfplumber fails to extract text (e.g., fully scanned image-based PDF without OCR layer), the pipeline will flag it with 'Low Extraction Confidence'. OCR fallback via Docling is planned for a future release.",
  },
];

const SHORTCUTS = [
  { keys: ["⌘", "K"], action: "Open global search / command palette" },
  { keys: ["Esc"], action: "Close search, dialogs, or popovers" },
  { keys: ["↵"], action: "Select search result" },
];

export default function HelpPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Help & Documentation"
        description="Learn how the AI pipeline works, understand business rules, and find answers to common questions."
        action={
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Try it now
          </Link>
        }
      />

      {/* Pipeline Overview */}
      <SectionCard
        title="How the AI Pipeline Works"
        description="InvoiceIQ uses a four-stage LangGraph pipeline to analyze every invoice."
      >
        <div className="space-y-4">
          {PIPELINE_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <div key={i} className="flex gap-4">
                {/* Stage indicator */}
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-xl ${stage.color.bg} ${stage.color.border} border flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${stage.color.iconText}`} />
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className="w-px flex-1 min-h-4 bg-gray-100 my-1" />
                  )}
                </div>

                {/* Content */}
                <div className={`flex-1 pb-4 ${i < PIPELINE_STAGES.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${stage.color.text}`}>
                      Stage {stage.index}
                    </span>
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                    <span className="text-sm font-semibold text-gray-900">{stage.name}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-2">{stage.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stage.outputs.map((o) => (
                      <code
                        key={o}
                        className="text-[10px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded"
                      >
                        {o}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-5">
        {/* Business Rules */}
        <SectionCard title="Business Rules">
          <div className="space-y-3">
            {BUSINESS_RULES.map((rule, i) => (
              <div key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                <div className="flex items-start gap-2 mb-0.5">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                      rule.severity === "Critical"
                        ? "bg-red-100 text-red-700"
                        : rule.severity === "Important"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {rule.severity}
                  </span>
                  <p className="text-sm font-semibold text-gray-900">{rule.rule}</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed pl-12">{rule.desc}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Tolerance table */}
        <div className="space-y-4">
          <SectionCard title="Tolerance Formula">
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                tolerance = max(pct × po_total, dollar_floor)
              </code>
              <br />
              Dollar amounts are floors, not ceilings. The 3× cap applies only to overages.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">PO Tier</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Overage</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Underage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {TOLERANCE_TIERS.map((t) => (
                  <tr key={t.tier}>
                    <td className="py-2 px-3 font-medium text-gray-700">{t.tier}</td>
                    <td className="py-2 px-3 font-mono text-gray-600">{t.overage}</td>
                    <td className="py-2 px-3 font-mono text-gray-600">{t.underage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Keyboard Shortcuts">
            <div className="space-y-2">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{s.action}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="text-xs font-mono bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-700"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* FAQ */}
      <SectionCard title="Frequently Asked Questions">
        <div className="space-y-5">
          {FAQS.map((faq, i) => (
            <div key={i} className="border-b border-gray-50 last:border-0 pb-5 last:pb-0">
              <div className="flex gap-3">
                <HelpCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">{faq.q}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Architecture */}
      <SectionCard title="Architecture Overview">
        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { label: "Orchestration", value: "LangGraph StateGraph" },
            { label: "AI Model", value: "GPT-4o mini (dev) / GPT-4o (demo)" },
            { label: "PDF Parsing", value: "pdfplumber" },
            { label: "Schema Validation", value: "Pydantic v2" },
            { label: "Backend API", value: "FastAPI (async)" },
            { label: "Database", value: "Supabase Postgres" },
            { label: "Frontend", value: "Next.js 16 + Tailwind" },
            { label: "State", value: "TypedDict with Annotated reducers" },
            { label: "Deployment", value: "Vercel + Railway" },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
                {item.label}
              </p>
              <p className="text-xs font-semibold text-gray-800">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
