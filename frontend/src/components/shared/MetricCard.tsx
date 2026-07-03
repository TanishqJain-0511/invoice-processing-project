interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  color?: "default" | "emerald" | "amber" | "red" | "blue";
}

const COLOR_MAP = {
  default: "text-gray-900",
  emerald: "text-emerald-700",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-600",
};

export default function MetricCard({
  label,
  value,
  subtext,
  color = "default",
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4 card-hover">
      <p className="text-xs text-gray-500 font-medium mb-1.5">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight ${COLOR_MAP[color]}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  );
}
