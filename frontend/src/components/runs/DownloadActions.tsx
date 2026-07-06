"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Copy, Check, FileText } from "lucide-react";
import type { RunDetail } from "@/lib/api";

function buildSummaryText(run: RunDetail, id: string, summary: string): string {
  const amountStr =
    run.extracted_data.total != null ? `$${run.extracted_data.total.toFixed(2)}` : "—";
  return [
    `InvoiceIQ Decision Report`,
    `========================`,
    `Decision: ${run.decision.toUpperCase()}`,
    `Confidence: ${run.decision_confidence}`,
    `Invoice: ${run.invoice_filename}`,
    `Vendor: ${run.extracted_data.vendor_name}`,
    `Amount: ${amountStr}`,
    `Matched PO: ${run.matched_po ?? "None"}`,
    `Run ID: ${id}`,
    ``,
    `Summary: ${summary}`,
    ``,
    `Flags (${run.flags_raised.length}):`,
    ...run.flags_raised.map(
      (f) => `  - [${f.flag_confidence.toUpperCase()}] ${f.subcategory}: ${f.detail}`
    ),
  ].join("\n");
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildSummaryCsv(run: RunDetail, id: string): string {
  const header = [
    "run_id",
    "decision",
    "decision_confidence",
    "extraction_confidence",
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "total",
    "matched_po",
    "flags",
  ];
  const row = [
    id,
    run.decision,
    run.decision_confidence,
    run.extraction_confidence,
    run.extracted_data.vendor_name,
    run.extracted_data.invoice_number,
    run.extracted_data.invoice_date,
    run.extracted_data.total,
    run.matched_po ?? "",
    run.flags_raised.map((f) => f.subcategory).join("; "),
  ];
  return [header.map(csvEscape).join(","), row.map(csvEscape).join(",")].join("\n");
}

export function CopySummaryButton({
  run,
  id,
  summary,
}: {
  run: RunDetail;
  id: string;
  summary: string;
}) {
  const [copied, setCopied] = useState(false);

  function copySummary() {
    navigator.clipboard.writeText(buildSummaryText(run, id, summary));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copySummary}
      title="Copy summary"
      className="text-gray-400 hover:text-gray-700 transition-colors p-1"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export default function DownloadActions({
  run,
  id,
}: {
  run: RunDetail;
  id: string;
}) {
  function downloadCsv() {
    const blob = new Blob([buildSummaryCsv(run, id)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-run-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-900 mb-3">Export</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadCsv}
          className="inline-flex items-center gap-2 border border-gray-200 text-sm font-medium text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Process Another
        </Link>
      </div>
    </div>
  );
}
