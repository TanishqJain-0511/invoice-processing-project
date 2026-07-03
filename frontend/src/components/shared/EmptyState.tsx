import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: "primary" | "ghost";
  };
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const btnClass =
    action?.variant === "ghost"
      ? "text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
      : "text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-gray-900 mb-1">{title}</p>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action &&
        (action.href ? (
          <Link href={action.href} className={btnClass}>
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className={btnClass}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
