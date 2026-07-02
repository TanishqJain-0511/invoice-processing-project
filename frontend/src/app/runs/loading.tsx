export default function Loading() {
  return (
    <main className="min-h-screen py-8 px-6 animate-pulse">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 bg-slate-200 rounded" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="h-6 w-8 bg-slate-200 rounded mb-1.5" />
              <div className="h-3 w-14 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex gap-4">
            {[180, 60, 80, 60, 80].map((w, i) => (
              <div key={i} className={`h-3 bg-slate-100 rounded`} style={{ width: w }} />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="px-5 py-4 border-b border-slate-50 flex items-center gap-6"
            >
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-3 w-12 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-200 rounded-full" />
              <div className="h-4 w-14 bg-slate-100 rounded hidden sm:block" />
              <div className="h-4 w-10 bg-slate-100 rounded hidden sm:block" />
              <div className="ml-auto space-y-1.5 text-right">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-3 w-16 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
