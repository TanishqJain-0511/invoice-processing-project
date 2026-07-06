"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Settings,
  HelpCircle,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import MetricCard from "@/components/shared/MetricCard";
import SectionCard from "@/components/shared/SectionCard";
import DecisionBadge from "@/components/shared/DecisionBadge";
import EmptyState from "@/components/shared/EmptyState";
import DateRangeFilter from "@/components/shared/DateRangeFilter";
import { MetricCardSkeleton } from "@/components/shared/LoadingSkeleton";
import { getRuns, RunSummary } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { DEFAULT_DATE_RANGE, DateRangeValue, dateRangeToParams, isWithinDateRange } from "@/lib/dateRange";
import { stripPdfExtension } from "@/lib/decision";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const QUICK_ACTIONS = [
  {
    label: "Upload Invoice",
    description: "Process a new vendor invoice with AI",
    href: "/upload",
    icon: Upload,
    primary: true,
  },
  {
    label: "Business Rules",
    description: "Configure flag escalation rules",
    href: "/config",
    icon: Settings,
    primary: false,
  },
  {
    label: "How It Works",
    description: "Pipeline guide and documentation",
    href: "/help",
    icon: HelpCircle,
    primary: false,
  },
];

const PIPELINE_STEPS = [
  { name: "Extraction", desc: "PDF → structured data", color: "bg-blue-500", anchor: "stage-1" },
  { name: "Validation", desc: "Fields + math + dates", color: "bg-violet-500", anchor: "stage-2" },
  { name: "Matching", desc: "PO + vendor + tolerance", color: "bg-amber-500", anchor: "stage-3" },
  { name: "Decision", desc: "Approve / Flag / Reject", color: "bg-emerald-500", anchor: "stage-4" },
];

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const user = getUser();

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const scoped = useMemo(
    () => runs.filter((r) => isWithinDateRange(r.created_at, dateRange)),
    [runs, dateRange]
  );

  const total = scoped.length;
  const approved = scoped.filter((r) => r.decision === "approve").length;
  const flagged = scoped.filter((r) => r.decision === "flag").length;
  const rejected = scoped.filter((r) => r.decision === "reject").length;
  const recent = scoped.slice(0, 6);
  const flaggedRuns = scoped.filter((r) => r.decision === "flag");

  function historyHref(status: "all" | "approve" | "flag" | "reject") {
    const params = dateRangeToParams(dateRange);
    if (status !== "all") params.set("status", status);
    return `/runs?${params.toString()}`;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title={`${getGreeting()}${user ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Here's a snapshot of your invoice processing activity."
        action={
          <Link
            href="/upload"
            className="inline-flex items-center gap-2.5 bg-gray-900 text-white text-base font-semibold px-6 py-3.5 rounded-lg shadow-sm hover:bg-gray-700 hover:shadow-md transition-all"
          >
            <Upload className="w-5 h-5" />
            Upload Invoice
          </Link>
        }
      />

      {/* Date range */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard label="Total Processed" value={total} subtext={total === 0 ? "No runs yet" : "in range"} href={historyHref("all")} />
            <MetricCard label="Approved" value={approved} color="emerald" tint subtext={total > 0 ? `${Math.round((approved / total) * 100)}% approval rate` : undefined} href={historyHref("approve")} />
            <MetricCard label="Flagged" value={flagged} color="amber" tint subtext={flagged > 0 ? "Needs review" : "None pending"} href={historyHref("flag")} />
            <MetricCard label="Rejected" value={rejected} color="red" tint subtext={rejected > 0 ? "Critical issues found" : "None rejected"} href={historyHref("reject")} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="col-span-1">
          <SectionCard title="Quick Actions" eyebrow>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-50 transition-colors group"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        action.primary
                          ? "bg-gray-900 group-hover:bg-gray-700"
                          : "bg-gray-100 group-hover:bg-gray-200"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          action.primary ? "text-white" : "text-gray-600"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                        {action.label}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{action.description}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          {/* Pipeline Status */}
          <SectionCard title="AI Pipeline" className="mt-4">
            <div className="space-y-1">
              {PIPELINE_STEPS.map((stage, i) => (
                <Link
                  key={i}
                  href={`/help#${stage.anchor}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    {i < PIPELINE_STEPS.length - 1 && <div className="w-px h-4 bg-gray-100 my-0.5" />}
                  </div>
                  <div className="pb-1 flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 group-hover:text-gray-900 group-hover:underline underline-offset-2">
                      {stage.name}
                    </p>
                    <p className="text-[10px] text-gray-400">{stage.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Recent Activity */}
        <div className="col-span-2">
          <SectionCard
            title="Recent Activity"
            eyebrow
            action={
              total > 0 ? (
                <Link
                  href="/runs"
                  className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              ) : undefined
            }
            noPadding
          >
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-100 rounded w-40" />
                      <div className="h-2.5 bg-gray-100 rounded w-24" />
                    </div>
                    <div className="h-5 bg-gray-100 rounded-full w-16 shrink-0" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No invoices processed yet"
                description="Upload your first invoice to begin AI-powered validation."
                action={{ label: "Upload Invoice", href: "/upload" }}
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {flagged > 0 && (
                  <Link
                    href={historyHref("flag")}
                    className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-amber-50 border-b border-amber-100 px-5 py-2 hover:bg-amber-100 transition-colors"
                  >
                    <span className="text-xs font-medium text-amber-800">
                      {flagged} invoice{flagged !== 1 ? "s" : ""} flagged for review
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                  </Link>
                )}
                <div className="divide-y divide-gray-50">
                {recent.map((run) => {
                  const DecisionIcon =
                    run.decision === "approve"
                      ? CheckCircle
                      : run.decision === "reject"
                      ? XCircle
                      : AlertTriangle;
                  const iconColor =
                    run.decision === "approve"
                      ? "text-emerald-500"
                      : run.decision === "reject"
                      ? "text-red-500"
                      : "text-amber-500";
                  const iconBg =
                    run.decision === "approve"
                      ? "bg-emerald-50"
                      : run.decision === "reject"
                      ? "bg-red-50"
                      : "bg-amber-50";

                  return (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
                      >
                        <DecisionIcon className={`w-4 h-4 ${iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-gray-900">
                          {stripPdfExtension(run.invoice_filename)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {run.matched_po
                              ? run.matched_po
                              : run.flags_count > 0
                              ? `${run.flags_count} flag${run.flags_count !== 1 ? "s" : ""}`
                              : "No PO matched"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <DecisionBadge decision={run.decision} size="sm" />
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock className="w-2.5 h-2.5" />
                          {formatRelative(run.created_at)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Flagged invoices summary */}
          {!loading && flaggedRuns.length > 0 && (
            <SectionCard
              title="Needs Your Review"
              description="These invoices were flagged by the AI and require human judgment."
              className="mt-4"
              noPadding
              action={
                <Link
                  href="/runs"
                  className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  View all
                </Link>
              }
            >
              <div className="divide-y divide-gray-50">
                {flaggedRuns.slice(0, 3).map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="w-1 h-8 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {run.invoice_filename ?? "Invoice"}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {run.flag_categories.join(", ") || "Flagged for review"}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
