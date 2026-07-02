import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-6xl font-bold text-slate-100 mb-4 select-none">404</p>
        <p className="text-sm font-semibold text-slate-700 mb-1">Page not found</p>
        <p className="text-xs text-slate-400 mb-6">
          This run doesn&apos;t exist or may have been deleted.
        </p>
        <Link
          href="/runs"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← Back to history
        </Link>
      </div>
    </main>
  );
}
