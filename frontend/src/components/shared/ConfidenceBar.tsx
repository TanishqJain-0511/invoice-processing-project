interface ConfidenceBarProps {
  value: "high" | "medium" | "low" | null | undefined;
  label?: string;
  showText?: boolean;
}

const CONFIG = {
  high: {
    bar: "w-full bg-emerald-500",
    text: "High",
    textColor: "text-emerald-700",
  },
  medium: {
    bar: "w-2/3 bg-amber-400",
    text: "Medium",
    textColor: "text-amber-600",
  },
  low: {
    bar: "w-1/3 bg-gray-300",
    text: "Low",
    textColor: "text-gray-500",
  },
};

export default function ConfidenceBar({
  value,
  label,
  showText = true,
}: ConfidenceBarProps) {
  const cfg = CONFIG[value ?? "low"] ?? CONFIG.low;

  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      )}
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${cfg.bar}`} />
      </div>
      {showText && (
        <span className={`text-xs font-medium w-12 text-right shrink-0 ${cfg.textColor}`}>
          {cfg.text}
        </span>
      )}
    </div>
  );
}
