"use client";

import Link from "next/link";
import { Download, Copy, FileText } from "lucide-react";
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

export default function DownloadActions({
  run,
  id,
  summary,
}: {
  run: RunDetail;
  id: string;
  summary: string;
}) {
  function downloadJson() {
    const blob = new Blob([JSON.stringify(run, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-run-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copySummary() {
    navigator.clipboard.writeText(buildSummaryText(run, id, summary));
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-900 mb-3">Export</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadJson}
          className="inline-flex items-center gap-2 border border-gray-200 text-sm font-medium text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download JSON
        </button>
        <button
          onClick={copySummary}
          className="inline-flex items-center gap-2 border border-gray-200 text-sm font-medium text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy Summary
        </button>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 border border-gray-200 text-sm font-medium text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Process Another
        </Link>
      </div>
    </div>
  );
}
