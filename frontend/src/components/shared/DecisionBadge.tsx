import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface DecisionBadgeProps {
  decision: "approve" | "flag" | "reject";
  size?: "sm" | "md" | "lg";
}

const CONFIGS = {
  approve: {
    label: "Approved",
    icon: CheckCircle,
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconClass: "text-emerald-500",
  },
  flag: {
    label: "Flagged",
    icon: AlertTriangle,
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    iconClass: "text-amber-500",
  },
  reject: {
    label: "Rejected",
    icon: XCircle,
    classes: "bg-red-50 text-red-700 border-red-200",
    iconClass: "text-red-500",
  },
};

const SIZE = {
  sm: { wrap: "text-xs px-2 py-0.5 gap-1", icon: "w-3 h-3" },
  md: { wrap: "text-sm px-2.5 py-1 gap-1.5", icon: "w-3.5 h-3.5" },
  lg: { wrap: "text-sm px-3 py-1.5 gap-2 font-semibold", icon: "w-4 h-4" },
};

export default function DecisionBadge({
  decision,
  size = "sm",
}: DecisionBadgeProps) {
  const config = CONFIGS[decision] ?? CONFIGS.flag;
  const s = SIZE[size];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full ${config.classes} ${s.wrap}`}
    >
      <Icon className={`shrink-0 ${s.icon} ${config.iconClass}`} />
      {config.label}
    </span>
  );
}
