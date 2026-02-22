import { useSyncExternalStore } from "react";

const emptySubscribe = (): (() => void) => () => {};

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    typeof window === "undefined"
      ? emptySubscribe
      : (callback) => {
          const mql = window.matchMedia(query);
          mql.addEventListener("change", callback);
          return () => mql.removeEventListener("change", callback);
        },
    () =>
      typeof window === "undefined" ? false : window.matchMedia(query).matches,
    () => false, // SSR fallback
  );
}
