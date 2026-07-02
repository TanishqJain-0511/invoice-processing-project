"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const path = usePathname();
  const isHistory = path.startsWith("/runs");

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <nav className="max-w-2xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-semibold text-slate-900 tracking-tight"
        >
          Invoice Processor
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <NavLink href="/" active={!isHistory}>
            Upload
          </NavLink>
          <NavLink href="/runs" active={isHistory}>
            History
          </NavLink>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-slate-100 text-slate-900"
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}
