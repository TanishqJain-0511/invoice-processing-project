"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, CheckCircle, AlertTriangle, Upload, X, Info, RotateCcw } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionCard from "@/components/shared/SectionCard";
import { getRuns, RunSummary } from "@/lib/api";
import { FlagRuleValue, computeEscalatedDecision } from "@/lib/decision";

/* ── Flag taxonomy ─────────────────────────────────────────── */
const FLAG_TAXONOMY = [
  {
    category: "PO Matching",
    description: "Rules related to purchase order identification",
    flags: [
      { subcategory: "Implicit Match — Exact Details", default: "flag" as const, description: "Invoice details match a PO but no PO number was explicitly referenced." },
      { subcategory: "Implicit Match — Near Match (within tolerance)", default: "flag" as const, description: "Invoice closely matches a PO with minor discrepancies within tolerance." },
      { subcategory: "Implicit Match — Weak Signal", default: "flag" as const, description: "Weak signals suggest a PO match but insufficient confidence." },
      { subcategory: "Referenced PO Not Found", default: "flag" as const, description: "The invoice explicitly references a PO number that doesn't exist in the database." },
      { subcategory: "No Matching PO Found", default: "flag" as const, description: "No purchase order could be matched to this invoice." },
    ],
  },
  {
    category: "Amount Discrepancy",
    description: "Rules related to invoice amounts vs. PO amounts",
    flags: [
      { subcategory: "Explained Overage", default: "flag" as const, description: "Invoice exceeds PO total, but additional line items explain the difference." },
      { subcategory: "Unexplained Overage (within tolerance → 3x)", default: "flag" as const, description: "Invoice exceeds PO total with no explanation, but within the 3× tolerance cap." },
      { subcategory: "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)", default: "reject" as const, locked: true, description: "Invoice exceeds PO total by more than 3× the tolerance threshold. Hardcoded reject trigger — cannot be changed." },
    ],
  },
  {
    category: "Vendor Validation",
    description: "Rules related to vendor approval status",
    flags: [
      { subcategory: "Unapproved Vendor", default: "flag" as const, description: "The vendor is not on the approved vendor list." },
    ],
  },
  {
    category: "Duplicate Detection",
    description: "Rules related to invoice deduplication",
    flags: [
      { subcategory: "Exact Invoice Number Match", default: "flag" as const, description: "An invoice with the same invoice number was previously processed." },
      { subcategory: "Fuzzy Match (vendor + amount + date, 60-day window)", default: "flag" as const, description: "Suspicious similarity to a recent invoice within the 60-day duplicate window." },
    ],
  },
  {
    category: "Data Quality",
    description: "Rules related to extraction quality and completeness",
    flags: [
      { subcategory: "Missing Critical Field", default: "flag" as const, description: "Required fields (vendor name, invoice number, or total) could not be extracted." },
      { subcategory: "Low Extraction Confidence", default: "flag" as const, description: "The AI extraction confidence was too low to trust the results." },
      { subcategory: "Internal Math Inconsistency (line items ≠ total)", default: "flag" as const, description: "Line item subtotals don't add up to the stated invoice total." },
    ],
  },
];

const FLAG_RULES_KEY = "invoiceProcessor:flagRules";
type FlagRules = Record<string, FlagRuleValue>;

/* ── Data sources ──────────────────────────────────────────── */
type DataKey = "poDataset" | "vendorList" | "invoiceHistory";
const DATA_SOURCES: { key: DataKey; label: string; description: string; fields: string }[] = [
  {
    key: "poDataset",
    label: "PO Dataset",
    description: "Purchase order records used for invoice matching.",
    fields: "po_number, vendor_name, po_total, line_items[], status",
  },
  {
    key: "vendorList",
    label: "Vendor List",
    description: "Approved vendor registry for vendor validation.",
    fields: "vendor_name",
  },
  {
    key: "invoiceHistory",
    label: "Invoice History",
    description: "Past invoices used for 60-day duplicate detection.",
    fields: "vendor_name, invoice_number, amount, invoice_date, processed_date",
  },
];

const TABS = ["Business Rules", "Reference Data"] as const;
type Tab = (typeof TABS)[number];

export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>("Business Rules");
  const [flagRules, setFlagRules] = useState<FlagRules>({});
  const [pending, setPending] = useState<{ sub: string; val: FlagRuleValue } | null>(null);
  const [affectedCount, setAffectedCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<Record<DataKey, string | null>>({ poDataset: null, vendorList: null, invoiceHistory: null });
  const [dataErrors, setDataErrors] = useState<Record<DataKey, string | null>>({ poDataset: null, vendorList: null, invoiceHistory: null });
  const fileRefs: Record<DataKey, React.RefObject<HTMLInputElement | null>> = {
    poDataset: useRef<HTMLInputElement>(null),
    vendorList: useRef<HTMLInputElement>(null),
    invoiceHistory: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FLAG_RULES_KEY);
      if (stored) setFlagRules(JSON.parse(stored));
    } catch {}
    const ds: Record<DataKey, string | null> = { poDataset: null, vendorList: null, invoiceHistory: null };
    for (const src of DATA_SOURCES) {
      ds[src.key] = localStorage.getItem(`invoiceProcessor:${src.key}`);
    }
    setDataSources(ds);
  }, []);

  function getRuleFor(sub: string): FlagRuleValue {
    if (sub in flagRules) return flagRules[sub];
    const flat = FLAG_TAXONOMY.flatMap((c) => c.flags).find((f) => f.subcategory === sub);
    return (flat?.default ?? "flag") as FlagRuleValue;
  }

  async function requestToggle(sub: string, val: FlagRuleValue) {
    let count = 0;
    try {
      const runs: RunSummary[] = await getRuns();
      const nextRules = { ...flagRules, [sub]: val };
      count = runs.filter(
        (r) => r.flags_raised?.some((f) => f.subcategory === sub)
          && computeEscalatedDecision(r.flags_raised ?? [], nextRules) !== r.decision
      ).length;
    } catch {}
    setAffectedCount(count);
    setPending({ sub, val });
  }

  function confirmToggle() {
    if (!pending) return;
    const updated = { ...flagRules, [pending.sub]: pending.val };
    setFlagRules(updated);
    localStorage.setItem(FLAG_RULES_KEY, JSON.stringify(updated));
    setPending(null);
    showToast("Business rule updated");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function resetRules() {
    setFlagRules({});
    localStorage.removeItem(FLAG_RULES_KEY);
    showToast("Rules reset to defaults");
  }

  function handleDataFile(key: DataKey, f: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Must be a JSON array");
        localStorage.setItem(`invoiceProcessor:${key}`, text);
        setDataSources((prev) => ({ ...prev, [key]: text }));
        setDataErrors((prev) => ({ ...prev, [key]: null }));
        showToast(`${DATA_SOURCES.find((s) => s.key === key)?.label} uploaded — ${parsed.length} records`);
      } catch (err) {
        setDataErrors((prev) => ({ ...prev, [key]: (err as Error).message }));
      }
    };
    reader.readAsText(f);
  }

  function clearDataSource(key: DataKey) {
    localStorage.removeItem(`invoiceProcessor:${key}`);
    setDataSources((prev) => ({ ...prev, [key]: null }));
    showToast("Data source cleared");
  }

  function getCount(key: DataKey): number {
    try {
      const val = dataSources[key];
      if (!val) return 0;
      return JSON.parse(val).length;
    } catch { return 0; }
  }

  const customRuleCount = Object.keys(flagRules).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg animate-slide-down">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Settings"
        description="Configure business rules and reference data for invoice processing."
        action={
          customRuleCount > 0 ? (
            <button
              onClick={resetRules}
              className="inline-flex items-center gap-2 border border-gray-200 text-sm text-gray-600 font-medium px-3 py-2 rounded-md hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset rules
            </button>
          ) : undefined
        }
      />

      {/* Config version */}
      <div className="flex items-center gap-3 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium text-gray-600">Configuration active</span>
        </div>
        <span className="text-gray-300">·</span>
        <span>{customRuleCount} custom rule{customRuleCount !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">·</span>
        <span>
          {Object.values(dataSources).filter(Boolean).length} data source{Object.values(dataSources).filter(Boolean).length !== 1 ? "s" : ""} loaded
        </span>
      </div>

      {/* Confirmation banner */}
      {pending && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-slide-down">
          <div className="flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Confirm rule change</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Setting <span className="font-medium">&ldquo;{pending.sub}&rdquo;</span> to{" "}
                <span
                  className={`font-bold ${
                    pending.val === "reject"
                      ? "text-red-700"
                      : pending.val === "approve"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  {pending.val.toUpperCase()}
                </span>
                {affectedCount > 0 && (
                  <> will mark <span className="font-semibold">{affectedCount} existing invoice{affectedCount !== 1 ? "s" : ""}</span> as needing reprocessing.</>
                )} Only affects new runs.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 ml-7">
            <button
              onClick={confirmToggle}
              className="text-sm font-medium bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setPending(null)}
              className="text-sm text-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Business Rules tab ─────────────────────────────── */}
      {tab === "Business Rules" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Choose how each flag type should be handled: approve, flag for review, or reject.
          </p>
          {FLAG_TAXONOMY.map((group) => (
            <SectionCard key={group.category} title={group.category} description={group.description}>
              <div className="space-y-1">
                {group.flags.map((flag) => {
                  const current = getRuleFor(flag.subcategory);
                  const isLocked = "locked" in flag && flag.locked;

                  const OPTIONS: { val: FlagRuleValue; label: string; active: string }[] = [
                    { val: "approve", label: "APPROVE", active: "bg-emerald-100 text-emerald-800" },
                    { val: "flag", label: "FLAG", active: "bg-amber-100 text-amber-800" },
                    { val: "reject", label: "REJECT", active: "bg-red-100 text-red-800" },
                  ];

                  return (
                    <div
                      key={flag.subcategory}
                      className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isLocked && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
                          <p className="text-sm font-medium text-gray-800">{flag.subcategory}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{flag.description}</p>
                      </div>

                      {/* Toggle */}
                      <div className="flex shrink-0 rounded-lg border border-gray-200 overflow-hidden">
                        {OPTIONS.map((opt, i) => {
                          const isActive = current === opt.val;
                          return (
                            <button
                              key={opt.val}
                              disabled={isLocked || isActive}
                              onClick={() => !isLocked && !isActive && requestToggle(flag.subcategory, opt.val)}
                              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                i > 0 ? "border-l border-gray-200" : ""
                              } ${
                                isActive ? opt.active : "bg-white text-gray-400 hover:bg-gray-50"
                              } ${isLocked ? "cursor-default opacity-60" : "cursor-pointer"}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* ── Reference Data tab ─────────────────────────────── */}
      {tab === "Reference Data" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Upload JSON files to override Supabase defaults. Data is stored locally in your browser.
              Leave empty to use the database.
            </p>
          </div>

          {DATA_SOURCES.map((src) => {
            const loaded = dataSources[src.key] !== null;
            const count = getCount(src.key);
            const err = dataErrors[src.key];

            return (
              <SectionCard key={src.key} title={src.label} description={src.description}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      Required fields:{" "}
                      <code className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded">
                        {src.fields}
                      </code>
                    </div>
                    {loaded ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        {count} records loaded
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                        Using Supabase default
                      </span>
                    )}
                  </div>

                  {err && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                      {err}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => fileRefs[src.key].current?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload JSON
                    </button>
                    {loaded && (
                      <button
                        onClick={() => clearDataSource(src.key)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    )}
                    <input
                      ref={fileRefs[src.key] as React.RefObject<HTMLInputElement>}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDataFile(src.key, f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
