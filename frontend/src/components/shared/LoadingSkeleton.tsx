import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-gray-100",
        className
      )}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-7 w-12" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton className={`h-3 ${i === 0 ? "w-40" : i === cols - 1 ? "w-20" : "w-24"}`} />
        </td>
      ))}
    </tr>
  );
}

export function RunDetailSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-6 max-w-6xl">
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <Skeleton className="h-10 w-10 rounded-lg mb-4" />
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-3/4 mb-6" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </div>
      <div className="col-span-3 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <Skeleton className="h-4 w-40 mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-2 w-16 mb-1" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-2 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
