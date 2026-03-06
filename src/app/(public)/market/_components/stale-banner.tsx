import { AlertCircle } from "lucide-react";

interface StaleBannerProps {
  /** Pre-translated message string */
  message: string;
}

export function StaleBanner({ message }: StaleBannerProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
