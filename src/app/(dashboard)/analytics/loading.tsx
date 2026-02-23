import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading(): React.ReactElement {
  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-[320px] w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[320px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    </div>
  );
}
