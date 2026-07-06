"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  Search,
  FileText,
  X,
  Filter,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import MetricCard from "@/components/shared/MetricCard";
import DecisionBadge from "@/components/shared/DecisionBadge";
import ConfidenceBar from "@/components/shared/ConfidenceBar";
import EmptyState from "@/components/shared/EmptyState";
import DateRangeFilter from "@/components/shared/DateRangeFilter";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/shared/LoadingSkeleton";
import { getRuns, RunSummary } from "@/lib/api";
import { DEFAULT_DATE_RANGE, DateRangeValue, dateRangeFromParams, isWithinDateRange } from "@/lib/dateRange";
import { FlagRules, computeEscalatedDecision } from "@/lib/decision";

const FLAG_CATEGORIES = [
  "PO Matching",
  "Amount Discrepancy",
  "Vendor Validation",
  "Duplicate Detection",
  "Data Quality",
];

const FLAG_SUBCATEGORIES: Record<string, string[]> = {
  "PO Matching": [
    "Implicit Match — Exact Details",
    "Implicit Match — Near Match (within tolerance)",
    "Implicit Match — Weak Signal",
    "Referenced PO Not Found",
    "No Matching PO Found",
  ],
  "Amount Discrepancy": [
    "Explained Overage",
    "Unexplained Overage (within tolerance → 3x)",
    "Unexplained Overage — Beyond 3x Tolerance (Reject Trigger)",
  ],
  "Vendor Validation": ["Unapproved Vendor"],
  "Duplicate Detection": [
    "Exact Invoice Number Match",
    "Fuzzy Match (vendor + amount + date, 60-day window)",
  ],
  "Data Quality": [
    "Missing Critical Field",
    "Low Extraction Confidence",
    "Internal Math Inconsistency (line items ≠ total)",
  ],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RunsPage() {
  return (
    <Suspense fallback={null}>
      <RunsPageInner />
    </Suspense>
  );
}

function RunsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "approve" | "flag" | "reject">(
    (searchParams.get("status") as "all" | "approve" | "flag" | "reject") ?? "all"
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(
    searchParams.get("range") ? dateRangeFromParams(searchParams) : DEFAULT_DATE_RANGE
  );
  const [flagRules, setFlagRules] = useState<FlagRules>({});

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
    try {
      const stored = localStorage.getItem("invoiceProcessor:flagRules");
      if (stored) setFlagRules(JSON.parse(stored));
    } catch {}
  }, []);

  function isStale(run: RunSummary): boolean {
    return computeEscalatedDecision(run.flags_raised ?? [], flagRules) !== run.decision;
  }

  const dateFiltered = useMemo(
    () => runs.filter((r) => isWithinDateRange(r.created_at, dateRange)),
    [runs, dateRange]
  );

  const filtered = useMemo(() => {
    return dateFiltered.filter((r) => {
      if (query) {
        const q = query.toLowerCase();
        const name = (r.invoice_filename ?? "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (decisionFilter !== "all" && r.decision !== decisionFilter) return false;
      if (categoryFilter !== "all" && !r.flag_categories.includes(categoryFilter)) return false;
      if (subcategoryFilter !== "all") {
        const match = r.flags_raised?.some((f) => f.subcategory === subcategoryFilter) ?? false;
        if (!match) return false;
      }
      return true;
    });
  }, [dateFiltered, query, decisionFilter, categoryFilter, subcategoryFilter]);

  const total = dateFiltered.length;
  const approved = dateFiltered.filter((r) => r.decision === "approve").length;
  const flagged = dateFiltered.filter((r) => r.decision === "flag").length;
  const rejected = dateFiltered.filter((r) => r.decision === "reject").length;
  const stale = dateFiltered.filter(isStale).length;

  const showCategoryFilter = decisionFilter === "flag" || decisionFilter === "reject";

  const hasActiveFilters =
    query || decisionFilter !== "all" || (showCategoryFilter && categoryFilter !== "all") || (showCategoryFilter && subcategoryFilter !== "all");

  function clearFilters() {
    setQuery("");
    setDecisionFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
  }

  const DECISION_LABELS: Record<"all" | "approve" | "flag" | "reject", string> = {
    all: "All",
    approve: "Approved",
    flag: "Flagged",
    reject: "Rejected",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        title="Invoice History"
        description="All invoice processing runs with AI decisions and reasoning."
        action={
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Invoice
          </Link>
        }
      />

      {/* Date range */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Metrics */}
      <div className="grid grid-cols-5 gap-3">
        {loading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard label="Total" value={total} tint />
            <MetricCard label="Approved" value={approved} color="emerald" tint />
            <MetricCard label="Flagged" value={flagged} color="amber" tint />
            <MetricCard label="Rejected" value={rejected} color="red" tint />
            <MetricCard
              label="Needs Reprocess"
              value={stale}
              color={stale > 0 ? "amber" : "default"}
              subtext={stale > 0 ? "Rules changed" : "All current"}
              tint={stale > 0}
            />
          </>
        )}
      </div>

      {/* Search + filters */}
      {total > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
          {/* Search row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by filename..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 border border-gray-200 rounded-md p-1">
              {(["all", "approve", "flag", "reject"] as const).map((d) => {
                const isActive = decisionFilter === d;
                const color = {
                  all: isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50",
                  approve: isActive ? "bg-emerald-600 text-white" : "text-gray-500 hover:bg-gray-50",
                  flag: isActive ? "bg-amber-500 text-white" : "text-gray-500 hover:bg-gray-50",
                  reject: isActive ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50",
                }[d];
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setDecisionFilter(d);
                      if (d !== "flag" && d !== "reject") {
                        setCategoryFilter("all");
                        setSubcategoryFilter("all");
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${color}`}
                  >
                    {DECISION_LABELS[d]}
                  </button>
                );
              })}
            </div>

            {showCategoryFilter && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setSubcategoryFilter("all"); }}
                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="all">All categories</option>
                {FLAG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {categoryFilter !== "all" && (
                <select
                  value={subcategoryFilter}
                  onChange={(e) => setSubcategoryFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 max-w-[200px]"
                >
                  <option value="all">All subcategories</option>
                  {(FLAG_SUBCATEGORIES[categoryFilter] ?? []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
            )}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1 ml-auto"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              {query && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  Search: {query}
                  <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
                </span>
              )}
              {decisionFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full capitalize">
                  {decisionFilter}
                  <button onClick={() => setDecisionFilter("all")} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
                </span>
              )}
              {categoryFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  {categoryFilter}
                  <button onClick={() => { setCategoryFilter("all"); setSubcategoryFilter("all"); }} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
                </span>
              )}
              {subcategoryFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full max-w-xs truncate">
                  {subcategoryFilter}
                  <button onClick={() => setSubcategoryFilter("all")} className="text-gray-400 hover:text-gray-700 shrink-0"><X className="w-3 h-3" /></button>
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {filtered.length} of {total}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Invoice", "Decision", "Matched PO", "Confidence", "Date"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)}
            </tbody>
          </table>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoice runs yet"
            description="Upload your first invoice PDF to begin AI-powered processing."
            action={{ label: "Upload Invoice", href: "/upload" }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No results match your filters"
            description="Try adjusting your search query or removing some filters."
            action={{ label: "Clear filters", onClick: clearFilters, variant: "ghost" }}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Decision
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Matched PO
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Decision Confidence
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Processed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((run) => {
                const stale = isStale(run);
                return (
                  <tr
                    key={run.id}
                    onClick={() => router.push(`/runs/${run.id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[200px] group-hover:text-gray-700">
                            {run.invoice_filename ?? "—"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {run.flags_count > 0 && (
                              <span className="text-xs text-gray-400">
                                {run.flags_count} flag{run.flags_count !== 1 ? "s" : ""}
                              </span>
                            )}
                            {stale && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                Reprocess needed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <DecisionBadge decision={run.decision} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className={run.matched_po ? "text-sm text-gray-600" : "text-sm text-gray-400 italic"}>
                        {run.matched_po ?? "No PO Found"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell w-40">
                      <ConfidenceBar value={run.decision_confidence} showText />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{formatDate(run.created_at)}</p>
                          <p className="text-[10px] text-gray-400 flex items-center justify-end gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(run.created_at)}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
