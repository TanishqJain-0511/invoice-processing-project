"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Upload,
  History,
  Settings,
  HelpCircle,
  Building2,
  LogOut,
  FileText,
} from "lucide-react";
import { getUser, logout } from "@/lib/auth";

const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/upload", label: "Upload Invoice", icon: Upload, exact: true },
      { href: "/runs", label: "History", icon: History },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/config", label: "Settings", icon: Settings },
      { href: "/admin", label: "Admin", icon: Building2 },
      { href: "/help", label: "Help", icon: HelpCircle },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [companyName, setCompanyName] = useState<string>("");

  function loadData() {
    setUser(getUser());
    try {
      const info = localStorage.getItem("invoiceProcessor:companyInfo");
      if (info) {
        const parsed = JSON.parse(info);
        setCompanyName(parsed.name || "");
      } else {
        setCompanyName("");
      }
    } catch {}
  }

  useEffect(() => {
    loadData();
    window.addEventListener("storage", loadData);
    return () => window.removeEventListener("storage", loadData);
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return path === href;
    return path.startsWith(href);
  }

  const brandName = companyName || "InvoiceIQ";

  return (
    <aside className="w-56 shrink-0 h-screen flex flex-col bg-white border-r border-gray-200">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {brandName}
            </p>
            {companyName ? (
              <p className="text-[10px] text-gray-400 leading-tight">AI Invoice Processing</p>
            ) : (
              <p className="text-[10px] text-gray-400 leading-tight">AI Invoice Processing</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100 group ${
                      active
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        active ? "text-gray-700" : "text-gray-400 group-hover:text-gray-600"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-2.5 py-3 border-t border-gray-100 space-y-0.5">
        {user && (
          <div className="flex items-center gap-2.5 px-2.5 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-gray-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
