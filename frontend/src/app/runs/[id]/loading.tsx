import { RunDetailSkeleton } from "@/components/shared/LoadingSkeleton";

export default function RunDetailLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="h-5 w-32 bg-gray-100 rounded animate-pulse mb-6" />
      <RunDetailSkeleton />
    </div>
  );
}
