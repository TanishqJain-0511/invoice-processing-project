import Link from "next/link";
import { FileSearch, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
          <FileSearch className="w-7 h-7 text-gray-400" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Page not found</h1>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          This invoice run doesn&apos;t exist or may have been deleted from the database.
        </p>
        <Link
          href="/runs"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoice History
        </Link>
      </div>
    </div>
  );
}
