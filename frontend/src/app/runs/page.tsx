import Link from "next/link";
import { getRuns, RunSummary } from "@/lib/api";
import RunsTable from "@/components/RunsTable";

export default async function RunsPage() {
  let runs: RunSummary[] = [];
  try {
    runs = await getRuns();
  } catch {
    // backend not reachable — show empty state
  }

  const total = runs.length;
  const approved = runs.filter((r) => r.decision === "approve").length;
  const flagged = runs.filter((r) => r.decision === "flag").length;
  const rejected = runs.filter((r) => r.decision === "reject").length;

  return (
    <main className="min-h-screen py-8 px-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            Invoice History
          </h1>
          <Link
            href="/"
            className="text-sm font-medium bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
          >
            + New Run
          </Link>
        </div>

        {/* Stats */}
        {total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Total" value={total} color="text-slate-800" />
            <Stat label="Approved" value={approved} color="text-green-700" />
            <Stat label="Flagged" value={flagged} color="text-amber-600" />
            <Stat label="Rejected" value={rejected} color="text-red-600" />
          </div>
        )}

        {/* Runs list */}
        {runs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-sm font-medium text-slate-500">No runs yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Upload your first invoice to get started.
            </p>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Upload an invoice →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <RunsTable runs={runs} />
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
