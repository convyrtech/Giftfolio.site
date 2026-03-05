import { Skeleton } from "@/components/ui/skeleton";

export default function MarketLoading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="rounded-md border border-border">
        <div className="border-b border-border p-3">
          <div className="flex gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border p-3 last:border-0">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
