import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Package,
  Building2,
  Hash,
  Calendar,
  DollarSign,
  Shield,
  Info,
} from "lucide-react";
import { getRun, RunDetail, Flag, LineItem } from "@/lib/api";
import ConfidenceBar from "@/components/shared/ConfidenceBar";
import SectionCard from "@/components/shared/SectionCard";
import DownloadActions, { CopySummaryButton } from "@/components/runs/DownloadActions";
import { stripPdfExtension } from "@/lib/decision";

/* ── Stage definitions ───────────────────────────────────────── */
const STAGE_DEFS = [
  { prefix: "Stage 1", name: "Extraction", color: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" } },
  { prefix: "Stage 2", name: "Validation", color: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-500" } },
  { prefix: "Stage 3", name: "Matching", color: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" } },
  { prefix: "Stage 4", name: "Decision", color: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" } },
];

function groupByStage(trail: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = { "Stage 1": [], "Stage 2": [], "Stage 3": [], "Stage 4": [] };
  for (const line of trail) {
    const key = Object.keys(groups).find((k) => line.startsWith(k));
    if (key) groups[key].push(line);
  }
  return groups;
}

/* ── Degraded / execution-issue log detection ─────────────────
   Flags technical failure conditions (OCR fallback, unparseable data,
   routing shortcuts) as distinct from ordinary business flags (duplicate,
   amount mismatch, etc.) which already have their own flag UI. */
const DEGRADED_LOG_MARKERS = [
  /ocr fallback/i,
  /yielded empty or unusable/i,
  /could not parse/i,
  /insufficient data to attempt matching/i,
  /extraction_confidence=low/i,
  /cannot proceed/i,
];

function isDegradedLogLine(line: string): boolean {
  return DEGRADED_LOG_MARKERS.some((re) => re.test(line));
}

/* ── Decision style config ───────────────────────────────────── */
const DECISION_CONFIG = {
  approve: {
    icon: CheckCircle,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-100",
    titleColor: "text-emerald-800",
    borderColor: "border-emerald-200",
    bgColor: "bg-emerald-50",
    label: "Approved",
    summary: "All checks passed — this invoice is clear for payment.",
    action: "Safe to process payment.",
  },
  flag: {
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-100",
    titleColor: "text-amber-800",
    borderColor: "border-amber-200",
    bgColor: "bg-amber-50",
    label: "Flagged for Review",
    summary: "One or more issues require human review before proceeding.",
    action: "Review the flags below and make a manual judgment.",
  },
  reject: {
    icon: XCircle,
    iconColor: "text-red-500",
    iconBg: "bg-red-100",
    titleColor: "text-red-800",
    borderColor: "border-red-200",
    bgColor: "bg-red-50",
    label: "Rejected",
    summary: "A critical discrepancy was detected that cannot be overridden.",
    action: "Contact the vendor to correct the invoice and resubmit.",
  },
};

/* ── Executive summary generator ────────────────────────────── */
function buildSummary(run: RunDetail): string {
  const vendor = run.extracted_data.vendor_name;
  const amount = run.extracted_data.total != null ? `$${run.extracted_data.total.toFixed(2)}` : "an unspecified amount";
  const po = run.matched_po;

  if (run.decision === "approve") {
    return `The invoice from ${vendor} for ${amount}${po ? ` was matched against ${po}` : ""} and passed all validation checks. The vendor is on the approved list, invoice amounts are within tolerance, and no duplicate invoices were detected in the 60-day window.`;
  }
  if (run.decision === "flag") {
    const cats = [...new Set(run.flags_raised.map((f) => f.category))];
    return `The invoice from ${vendor} for ${amount} has been flagged due to ${cats.join(" and ")} concern${cats.length > 1 ? "s" : ""}. ${run.flags_raised.length} issue${run.flags_raised.length !== 1 ? "s were" : " was"} detected that require human review before payment can proceed.`;
  }
  const reason = run.flags_raised[0]?.detail ?? "an unexplained overage beyond the 3× tolerance cap";
  return `The invoice from ${vendor} for ${amount} has been rejected. ${reason} This decision is enforced by a hardcoded business rule and cannot be overridden without correcting the invoice.`;
}

/* ── Flag confidence badge ───────────────────────────────────── */
function FlagConfidenceBadge({ value }: { value: string }) {
  const classes =
    value === "high"
      ? "bg-red-50 text-red-700 border-red-200"
      : value === "medium"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${classes}`}>
      {value}
    </span>
  );
}

/* ── Quick fact item ─────────────────────────────────────────── */
function QuickFact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-base font-medium text-gray-900 mt-0.5">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/* ── Stage info tooltip ───────────────────────────────────────── */
const STAGE_INFO: Record<string, string> = {
  Extraction: "Parses the PDF and pulls out structured fields (vendor, amounts, dates) using GPT-4o mini.",
  Decision: "Applies precedence rules to all flags raised so far and produces the final approve/flag/reject verdict.",
};

function StageInfoIcon({ name }: { name: string }) {
  const text = STAGE_INFO[name];
  if (!text) return null;
  return (
    <span className="relative inline-flex group/info">
      <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
      <span className="hidden group-hover/info:block absolute left-1/2 -translate-x-1/2 bottom-5 z-20 w-56 bg-gray-900 text-white text-xs rounded-lg p-2.5 leading-relaxed shadow-lg">
        {text}
      </span>
    </span>
  );
}

/* ── Collapsible pipeline stage ──────────────────────────────── */
function PipelineStageCard({
  prefix,
  name,
  color,
  lines,
}: {
  prefix: string;
  name: string;
  color: (typeof STAGE_DEFS)[number]["color"];
  lines: string[];
}) {
  const done = lines.length > 0;

  if (!done) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-gray-200 opacity-50">
        <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-gray-400">—</span>
        </div>
        <p className="text-sm text-gray-400">{prefix} — {name} — skipped</p>
      </div>
    );
  }

  return (
    <details className="group rounded-lg border border-gray-200 overflow-hidden">
      <summary className={`flex items-center gap-3 px-4 py-3 cursor-pointer list-none ${color.bg} ${color.border} border hover:brightness-95 transition-all`}>
        <CheckCircle className={`w-4 h-4 shrink-0 ${color.text}`} />
        <span className={`text-sm font-semibold flex-1 ${color.text} flex items-center gap-1.5`}>
          {prefix} — {name}
          <StageInfoIcon name={name} />
        </span>
        <span className="text-sm text-gray-500 mr-2">{lines.length} log{lines.length !== 1 ? "s" : ""}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform group-open:rotate-180`} />
      </summary>
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <ul className="space-y-1.5">
          {lines.map((line, i) => {
            const degraded = isDegradedLogLine(line);
            return (
              <li
                key={i}
                className={`text-sm leading-relaxed flex gap-2 ${
                  degraded ? "text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1" : "text-gray-600"
                }`}
              >
                <span className={`shrink-0 mt-0.5 font-mono text-xs ${degraded ? "text-red-400" : "text-gray-300"}`}>
                  Step {i + 1}
                </span>
                <span>{line.replace(/^Stage\s+\d+[a-z]?\s*\([^)]*\):\s*/i, "")}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

/* ── Page component ──────────────────────────────────────────── */
export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dev?: string }>;
}) {
  const { id } = await params;
  const { dev } = await searchParams;
  const devMode = dev === "1";

  let run: RunDetail;
  try {
    run = await getRun(id);
  } catch {
    notFound();
  }

  const stageGroups = groupByStage(run.reasoning_trail);
  const dc = DECISION_CONFIG[run.decision] ?? DECISION_CONFIG.flag;
  const DecisionIcon = dc.icon;
  const summary = buildSummary(run);
  const flagSubcategories = [...new Set(run.flags_raised.map((f) => f.subcategory))];

  const amountStr = run.extracted_data.total != null
    ? `$${run.extracted_data.total.toFixed(2)}`
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back */}
      <Link
        href="/runs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Invoice History
      </Link>

      <div className="grid grid-cols-5 gap-6">
        {/* ── LEFT COLUMN (sticky) ───────────────────────────── */}
        <div className="col-span-2 space-y-4 sticky top-6 self-start">
          {/* Decision Hero */}
          <div className={`rounded-lg border ${dc.borderColor} ${dc.bgColor} p-5`}>
            <div className={`w-10 h-10 rounded-xl ${dc.iconBg} flex items-center justify-center mb-4`}>
              <DecisionIcon className={`w-5 h-5 ${dc.iconColor}`} />
            </div>

            <h1 className={`text-3xl font-bold tracking-tight ${dc.titleColor} mb-1`}>
              {dc.label}
            </h1>

            <p className="text-sm text-gray-600 mt-3 leading-relaxed border-t border-gray-200/60 pt-3">
              {dc.action}
            </p>

            {/* Confidence */}
            <div className="mt-4 space-y-2">
              <ConfidenceBar label="Decision confidence" value={run.decision_confidence} />
              <ConfidenceBar label="Extraction confidence" value={run.extraction_confidence} />
            </div>

            {run.matched_po && (
              <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-center justify-between text-sm">
                <span className="text-gray-500">Matched PO</span>
                <span className="font-semibold text-gray-900">{run.matched_po}</span>
              </div>
            )}

            <p className="text-sm text-gray-400 mt-3 truncate" title={run.invoice_filename ?? ""}>
              {stripPdfExtension(run.invoice_filename)}
            </p>

            {/* Flags accordion */}
            {run.flags_raised.length > 0 && (
              <details className="group mt-3 pt-3 border-t border-gray-200/60">
                <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-sm font-medium text-gray-700">
                  <span>Flags Raised ({run.flags_raised.length})</span>
                  <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 mt-3">
                  {run.flags_raised.map((flag: Flag, i: number) => (
                    <div key={i} className="border border-gray-100 bg-white rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <FlagConfidenceBadge value={flag.flag_confidence} />
                        <span className="text-sm font-medium text-gray-600">{flag.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">{flag.subcategory}</p>
                      <p className="text-sm text-gray-500 leading-relaxed">{flag.detail}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Quick Facts */}
          <SectionCard title="Invoice Details">
            <div className="grid grid-cols-2 gap-4">
              <QuickFact icon={Building2} label="Vendor" value={run.extracted_data.vendor_name} />
              <QuickFact icon={Hash} label="Invoice #" value={run.extracted_data.invoice_number} />
              <QuickFact icon={Calendar} label="Date" value={run.extracted_data.invoice_date} />
              <QuickFact icon={Package} label="PO Reference" value={run.extracted_data.po_reference ?? "None"} />
              <QuickFact
                icon={DollarSign}
                label="Subtotal"
                value={run.extracted_data.subtotal != null ? `$${run.extracted_data.subtotal.toFixed(2)}` : null}
              />
              <QuickFact
                icon={DollarSign}
                label="Tax"
                value={run.extracted_data.tax != null ? `$${run.extracted_data.tax.toFixed(2)}` : null}
              />
              <div className="col-span-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">Total Amount</span>
                <span className="text-lg font-bold text-gray-900">{amountStr ?? "—"}</span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── RIGHT COLUMN (scrollable) ──────────────────────── */}
        <div className="col-span-3 space-y-5">
          {/* Executive Summary */}
          <SectionCard
            title="Executive Summary"
            action={<CopySummaryButton run={run} id={id} summary={summary} />}
          >
            <div className="grid grid-cols-2 gap-4">
              <QuickFact icon={CheckCircle} label="Decision" value={dc.label} />
              <QuickFact icon={Building2} label="Vendor" value={run.extracted_data.vendor_name} />
              <QuickFact icon={DollarSign} label="Amount" value={amountStr} />
              <QuickFact icon={Package} label="Matched PO" value={run.matched_po ?? "No PO Found"} />
              <div className="col-span-2">
                <QuickFact
                  icon={AlertTriangle}
                  label="Flags"
                  value={flagSubcategories.length > 0 ? flagSubcategories.join(", ") : "None"}
                />
              </div>
            </div>
          </SectionCard>

          {/* Line Items */}
          {run.extracted_data.line_items.length > 0 && (
            <SectionCard title="Extracted Line Items" noPadding>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="text-right px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wider w-12">
                      Qty
                    </th>
                    <th className="text-right px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Unit
                    </th>
                    <th className="text-right px-5 py-2.5 font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {run.extracted_data.line_items.map((item: LineItem, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-2.5 text-gray-700">{item.description}</td>
                      <td className="px-5 py-2.5 text-gray-600 text-right">{item.quantity}</td>
                      <td className="px-5 py-2.5 text-gray-600 text-right">
                        ${item.unit_price.toFixed(2)}
                      </td>
                      <td className="px-5 py-2.5 text-gray-900 font-semibold text-right">
                        ${(item.quantity * item.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">
                      Invoice Total
                    </td>
                    <td className="px-5 py-2.5 text-sm font-bold text-gray-900 text-right">
                      {amountStr ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>
          )}

          {/* Pipeline Details (collapsible stages) */}
          <SectionCard title="How it worked?" description="Expand each stage to see full reasoning logs">
            <div className="space-y-2">
              {STAGE_DEFS.map((stage, i) => (
                <PipelineStageCard
                  key={i}
                  prefix={stage.prefix}
                  name={stage.name}
                  color={stage.color}
                  lines={stageGroups[stage.prefix] ?? []}
                />
              ))}
            </div>
          </SectionCard>

          {/* Developer Mode — hidden by default; append ?dev=1 to the URL to reveal */}
          {devMode && (
            <details className="group bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer list-none hover:bg-gray-50 transition-colors">
                <Shield className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-700 flex-1">Developer Mode</p>
                <span className="text-sm text-gray-400 mr-2">Raw pipeline data</span>
                <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="mt-4 grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="text-gray-400 mb-1">Model</p>
                    <p className="font-mono font-medium text-gray-800">gpt-4o-mini</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Pipeline</p>
                    <p className="font-mono font-medium text-gray-800">LangGraph StateGraph</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Run ID</p>
                    <p className="font-mono font-medium text-gray-700 truncate">{id}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Reasoning steps</p>
                    <p className="font-mono font-medium text-gray-800">{run.reasoning_trail.length}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Raw Extracted Data
                </p>
                <pre className="bg-gray-950 text-gray-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed font-mono max-h-64 overflow-y-auto">
                  {JSON.stringify(run.extracted_data, null, 2)}
                </pre>
                {run.flags_raised.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
                      Raw Flags
                    </p>
                    <pre className="bg-gray-950 text-gray-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed font-mono max-h-48 overflow-y-auto">
                      {JSON.stringify(run.flags_raised, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            </details>
          )}

          {/* Downloads */}
          <DownloadActions run={run} id={id} />
        </div>
      </div>
    </div>
  );
}
