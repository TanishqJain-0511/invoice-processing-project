"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Search, ChevronRight } from "lucide-react";
import { getUser } from "@/lib/auth";
import CommandPalette from "@/components/shared/CommandPalette";
import NotificationDropdown from "@/components/shared/NotificationDropdown";

const LABEL_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  upload: "Upload Invoice",
  runs: "History",
  config: "Settings",
  admin: "Admin",
  help: "Help",
  login: "Login",
};

export default function TopNav() {
  const path = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const segments = path.split("/").filter(Boolean);

  return (
    <>
      <header className="h-12 shrink-0 bg-white border-b border-gray-200 flex items-center px-5 gap-4">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
          {segments.length === 0 ? (
            <span className="text-gray-900 font-medium text-sm">Dashboard</span>
          ) : (
            segments.map((seg, i) => {
              const isLast = i === segments.length - 1;
              const label = LABEL_MAP[seg] ?? seg;
              return (
                <span key={`${seg}-${i}`} className="flex items-center gap-1 min-w-0">
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      isLast
                        ? "text-gray-900 font-medium text-sm"
                        : "text-gray-400 text-sm"
                    }`}
                  >
                    {label}
                  </span>
                </span>
              );
            })
          )}
        </nav>

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors w-52 bg-gray-50"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left text-xs">Search invoices...</span>
          <kbd className="text-[10px] bg-white border border-gray-200 rounded px-1 leading-4 font-mono text-gray-400">
            ⌘K
          </kbd>
        </button>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            </button>
            {notifOpen && (
              <NotificationDropdown onClose={() => setNotifOpen(false)} />
            )}
          </div>

          {user && (
            <div
              className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center cursor-default"
              title={`${user.name} · ${user.email}`}
            >
              <span className="text-[11px] font-semibold text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </header>

      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
    </>
  );
}
