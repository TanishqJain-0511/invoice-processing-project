"use client";

export type StageStatus = "pending" | "running" | "done" | "skipped";

interface Props {
  index: number;
  name: string;
  desc: string;
  status: StageStatus;
  lines?: string[];
}

export default function StageCard({ index, name, desc, status, lines }: Props) {
  const colors = {
    done: "border-green-100 bg-green-50",
    running: "border-blue-100 bg-blue-50",
    pending: "border-slate-100 bg-slate-50",
    skipped: "border-slate-100 bg-slate-50",
  };

  const labelColors = {
    done: "text-green-700",
    running: "text-blue-700",
    pending: "text-slate-400",
    skipped: "text-slate-400",
  };

  return (
    <div className={`rounded-lg border p-3 transition-colors ${colors[status]}`}>
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${labelColors[status]}`}>
            Stage {index} — {name}
          </p>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      {lines && lines.length > 0 && (
        <ul className="mt-2 pl-10 space-y-0.5">
          {lines.map((line, i) => (
            <li key={i} className="text-xs text-slate-500 leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done") {
    return (
      <svg
        className="w-5 h-5 text-green-500 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    );
  }
  if (status === "running") {
    return (
      <svg
        className="w-5 h-5 text-blue-500 shrink-0 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    );
  }
  return (
    <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
  );
}
