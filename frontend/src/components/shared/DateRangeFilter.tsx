"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import {
  DATE_RANGE_LABELS,
  DateRangePreset,
  DateRangeValue,
} from "@/lib/dateRange";

const PRESETS: DateRangePreset[] = ["all", "today", "7d", "30d", "90d", "custom"];

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 border border-gray-200 bg-white text-sm font-medium text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        {DATE_RANGE_LABELS[value.preset]}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1.5 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 w-48">
            {PRESETS.filter((p) => p !== "custom").map((p) => (
              <button
                key={p}
                onClick={() => {
                  onChange({ preset: p });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${
                  value.preset === p ? "text-gray-900 font-semibold" : "text-gray-600"
                }`}
              >
                {DATE_RANGE_LABELS[p]}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-2 px-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Custom range
              </p>
              <input
                type="date"
                value={value.from ?? ""}
                onChange={(e) => onChange({ preset: "custom", from: e.target.value, to: value.to })}
                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700"
              />
              <input
                type="date"
                value={value.to ?? ""}
                onChange={(e) => onChange({ preset: "custom", from: value.from, to: e.target.value })}
                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 mb-1.5"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
