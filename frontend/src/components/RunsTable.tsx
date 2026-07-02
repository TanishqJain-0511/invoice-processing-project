"use client";

import { useRouter } from "next/navigation";
import DecisionBadge from "@/components/DecisionBadge";
import { RunSummary } from "@/lib/api";

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

function confidenceColor(c: string | null) {
  if (c === "high") return "text-green-600";
  if (c === "medium") return "text-amber-500";
  return "text-slate-400";
}

export default function RunsTable({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs font-medium text-slate-400 uppercase tracking-wide">
          <th className="text-left px-5 py-3">Invoice</th>
          <th className="text-left px-4 py-3">Decision</th>
          <th className="text-left px-4 py-3 hidden sm:table-cell">
            Matched PO
          </th>
          <th className="text-left px-4 py-3 hidden sm:table-cell">
            Confidence
          </th>
          <th className="text-right px-5 py-3">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {runs.map((run) => (
          <tr
            key={run.id}
            onClick={() => router.push(`/runs/${run.id}`)}
            className="hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <td className="px-5 py-3.5">
              <span className="font-medium text-slate-800 truncate block max-w-[180px]">
                {run.invoice_filename ?? "—"}
              </span>
              {run.flags_count > 0 && (
                <span className="text-xs text-slate-400">
                  {run.flags_count} flag{run.flags_count !== 1 ? "s" : ""}
                </span>
              )}
            </td>
            <td className="px-4 py-3.5">
              <DecisionBadge decision={run.decision} />
            </td>
            <td className="px-4 py-3.5 hidden sm:table-cell text-slate-600">
              {run.matched_po ?? <span className="text-slate-300">—</span>}
            </td>
            <td className="px-4 py-3.5 hidden sm:table-cell">
              <span
                className={`font-medium ${confidenceColor(run.decision_confidence)}`}
              >
                {run.decision_confidence ?? "—"}
              </span>
            </td>
            <td className="px-5 py-3.5 text-right">
              <span className="text-slate-700">{formatDate(run.created_at)}</span>
              <span className="text-xs text-slate-400 block">
                {formatTime(run.created_at)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
