"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, History, Upload, LayoutDashboard, Settings, HelpCircle, X } from "lucide-react";
import { getRuns, RunSummary } from "@/lib/api";
import DecisionBadge from "@/components/shared/DecisionBadge";

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Dashboard", description: "Overview and metrics", href: "/dashboard", icon: LayoutDashboard },
  { label: "Upload Invoice", description: "Process a new invoice", href: "/upload", icon: Upload },
  { label: "Invoice History", description: "All previous runs", href: "/runs", icon: History },
  { label: "Settings", description: "Business rules and data sources", href: "/config", icon: Settings },
  { label: "Help", description: "How the pipeline works", href: "/help", icon: HelpCircle },
];

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    setLoading(true);
    getRuns()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  const q = query.toLowerCase();

  const filteredActions = QUICK_ACTIONS.filter(
    (a) => !q || a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
  );

  const filteredRuns = runs.filter(
    (r) =>
      q && r.invoice_filename?.toLowerCase().includes(q)
  ).slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search invoices, navigate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {/* Invoice results */}
          {filteredRuns.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Invoices
              </p>
              {filteredRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <History className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="flex-1 text-sm text-gray-700 truncate">
                    {run.invoice_filename ?? run.id}
                  </span>
                  <DecisionBadge decision={run.decision} size="sm" />
                </button>
              ))}
            </div>
          )}

          {/* Quick actions */}
          {filteredActions.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {query ? "Pages" : "Quick navigation"}
              </p>
              {filteredActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.href}
                    onClick={() => navigate(action.href)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{action.label}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Loading...
            </div>
          )}

          {!loading && filteredActions.length === 0 && filteredRuns.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4">
          <span className="text-[10px] text-gray-400">
            <kbd className="font-mono bg-white border border-gray-200 rounded px-1 py-0.5">↵</kbd> select
          </span>
          <span className="text-[10px] text-gray-400">
            <kbd className="font-mono bg-white border border-gray-200 rounded px-1 py-0.5">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
