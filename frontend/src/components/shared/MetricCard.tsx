import Link from "next/link";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  color?: "default" | "emerald" | "amber" | "red" | "blue";
  tint?: boolean;
  href?: string;
}

const COLOR_MAP = {
  default: "text-gray-900",
  emerald: "text-emerald-700",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-600",
};

const TINT_MAP = {
  default: "bg-white border-gray-200",
  emerald: "bg-emerald-50/60 border-emerald-100",
  amber: "bg-amber-50/60 border-amber-100",
  red: "bg-red-50/60 border-red-100",
  blue: "bg-blue-50/60 border-blue-100",
};

export default function MetricCard({
  label,
  value,
  subtext,
  color = "default",
  tint = false,
  href,
}: MetricCardProps) {
  const wrapperClass = `rounded-lg border shadow-sm px-5 py-4 card-hover ${
    tint ? TINT_MAP[color] : "bg-white border-gray-200"
  } ${href ? "block hover:shadow-md transition-shadow cursor-pointer" : ""}`;

  const content = (
    <>
      <p className="text-xs text-gray-500 font-medium mb-1.5">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight ${COLOR_MAP[color]}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
