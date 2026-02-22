"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

const emptySubscribe = (): (() => void) => () => {};

function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    typeof window === "undefined"
      ? emptySubscribe
      : (callback) => {
          window.addEventListener("online", callback);
          window.addEventListener("offline", callback);
          return () => {
            window.removeEventListener("online", callback);
            window.removeEventListener("offline", callback);
          };
        },
    () => (typeof window === "undefined" ? true : navigator.onLine),
    () => true,
  );
}

export function NetworkBanner(): React.ReactElement | null {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground">
      <WifiOff className="mr-2 inline-block h-4 w-4" />
      No connection — changes won&apos;t be saved
    </div>
  );
}
