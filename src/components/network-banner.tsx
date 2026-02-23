"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

// Hoisted to module scope for referential stability — prevents
// useSyncExternalStore from re-subscribing on every render.
const emptySubscribe = (): (() => void) => () => {};

const subscribe =
  typeof window === "undefined"
    ? emptySubscribe
    : (callback: () => void): (() => void) => {
        window.addEventListener("online", callback);
        window.addEventListener("offline", callback);
        return () => {
          window.removeEventListener("online", callback);
          window.removeEventListener("offline", callback);
        };
      };

const getSnapshot = (): boolean =>
  typeof window === "undefined" ? true : navigator.onLine;

const getServerSnapshot = (): boolean => true;

function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function NetworkBanner(): React.ReactElement | null {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div role="alert" className="fixed top-0 left-0 right-0 z-[100] bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground">
      <WifiOff className="mr-2 inline-block h-4 w-4" />
      No connection — changes won&apos;t be saved
    </div>
  );
}
