export default function Loading() {
  return (
    <main className="min-h-screen py-8 px-6 animate-pulse">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Back link */}
        <div className="h-4 w-28 bg-slate-200 rounded" />

        {/* Decision banner */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5 h-24" />

        {/* Stage cards */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5">
          <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-lg" />
          ))}
        </div>

        {/* Extracted data */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
