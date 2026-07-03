"use client";

import { useEffect, useRef } from "react";
import { CheckCircle, AlertTriangle, Settings, X } from "lucide-react";

interface Notification {
  id: string;
  type: "success" | "warning" | "info";
  title: string;
  body: string;
  time: string;
}

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "success",
    title: "Invoice Approved",
    body: "invoice_1_happy_path_INV-3001.pdf passed all checks.",
    time: "2 min ago",
  },
  {
    id: "2",
    type: "warning",
    title: "Invoice Flagged",
    body: "INV-3003 has an implicit PO match — review required.",
    time: "14 min ago",
  },
  {
    id: "3",
    type: "info",
    title: "Business Rules Updated",
    body: "Duplicate Detection escalated to REJECT.",
    time: "1 hr ago",
  },
];

const ICON_MAP = {
  success: { icon: CheckCircle, color: "text-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500" },
  info: { icon: Settings, color: "text-blue-500" },
};

export default function NotificationDropdown({
  onClose,
}: {
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-slide-down overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Notifications</p>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {DEMO_NOTIFICATIONS.map((n) => {
          const { icon: Icon, color } = ICON_MAP[n.type];
          return (
            <div
              key={n.id}
              className="flex gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">Demo notifications — connect to real events</p>
      </div>
    </div>
  );
}
