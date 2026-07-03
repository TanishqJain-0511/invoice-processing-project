"use client";

export type StageStatus = "pending" | "running" | "done" | "skipped";

// Each stage (1-indexed) gets its own color palette
const STAGE_PALETTES: Record<number, {
  running: string;
  done: string;
  label: { running: string; done: string };
  icon: { running: string; done: string };
}> = {
  1: {
    running: "border-blue-200 bg-blue-50",
    done: "border-blue-100 bg-blue-50/50",
    label: { running: "text-blue-700", done: "text-blue-600" },
    icon: { running: "text-blue-500", done: "text-blue-400" },
  },
  2: {
    running: "border-violet-200 bg-violet-50",
    done: "border-violet-100 bg-violet-50/50",
    label: { running: "text-violet-700", done: "text-violet-600" },
    icon: { running: "text-violet-500", done: "text-violet-400" },
  },
  3: {
    running: "border-amber-200 bg-amber-50",
    done: "border-amber-100 bg-amber-50/50",
    label: { running: "text-amber-700", done: "text-amber-600" },
    icon: { running: "text-amber-500", done: "text-amber-400" },
  },
  4: {
    running: "border-emerald-200 bg-emerald-50",
    done: "border-emerald-100 bg-emerald-50/50",
    label: { running: "text-emerald-700", done: "text-emerald-600" },
    icon: { running: "text-emerald-500", done: "text-emerald-400" },
  },
};

interface Props {
  index: number;
  name: string;
  desc: string;
  status: StageStatus;
  lines?: string[];
}

export default function StageCard({ index, name, desc, status, lines }: Props) {
  const palette = STAGE_PALETTES[index] ?? STAGE_PALETTES[1];

  const wrapperClass =
    status === "running"
      ? `border ${palette.running}`
      : status === "done"
      ? `border ${palette.done}`
      : "border border-slate-100 bg-slate-50";

  const labelClass =
    status === "running"
      ? palette.label.running
      : status === "done"
      ? palette.label.done
      : "text-slate-400";

  return (
    <div className={`rounded-lg p-3 transition-colors ${wrapperClass}`}>
      <div className="flex items-center gap-3">
        <StatusIcon status={status} index={index} palette={palette} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${labelClass}`}>
            Stage {index} — {name}
          </p>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
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

function StatusIcon({
  status,
  index,
  palette,
}: {
  status: StageStatus;
  index: number;
  palette: (typeof STAGE_PALETTES)[number];
}) {
  if (status === "done") {
    return (
      <svg
        className={`w-5 h-5 shrink-0 ${palette.icon.done}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "running") {
    return (
      <svg
        className={`w-5 h-5 shrink-0 animate-spin ${palette.icon.running}`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  // pending / skipped — show stage number in a circle
  return (
    <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0 flex items-center justify-center">
      <span className="text-[9px] font-semibold text-slate-300">{index}</span>
    </div>
  );
}
