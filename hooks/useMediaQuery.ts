"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Live `matchMedia` result; `fallback` is used during server rendering. */
export function useMediaQuery(query: string, fallback = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
