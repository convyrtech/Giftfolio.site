import { AlertCircle } from "lucide-react";

interface StaleBannerProps {
  /** Absolute time string, computed server-side (e.g. "14:32 UTC") */
  fetchedAtLabel: string;
}

export function StaleBanner({ fetchedAtLabel }: StaleBannerProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>Market data may be delayed — last updated at {fetchedAtLabel}. Live source is temporarily unavailable.</span>
    </div>
  );
}
