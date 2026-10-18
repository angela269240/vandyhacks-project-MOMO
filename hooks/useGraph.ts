"use client";

import useSWR, { type ScopedMutator } from "swr";
import { fetcher } from "@/lib/client/api";
import { INTERESTS } from "@/lib/interests";
import type { Graph, Interest } from "@/lib/types";

export const GRAPH_KEY = "/api/graph";

let queued: Promise<Graph | undefined> | null = null;

/**
 * Refetches the map now. Lobby events arrive in bursts (a profile is created, then it joins a room), and a
 * plain `mutate(GRAPH_KEY)` inside SWR's 2s dedupe window is dropped, so this coalesces a burst into one
 * forced fetch instead.
 */
export function refreshGraph(mutate: ScopedMutator): Promise<Graph | undefined> {
  queued ??= new Promise((resolve) =>
    setTimeout(() => {
      queued = null;
      resolve(mutate<Graph>(GRAPH_KEY, fetcher<Graph>(GRAPH_KEY), { revalidate: false }).catch(() => undefined));
    }, 100),
  );
  return queued;
}

/** The whole map. Lobby events trigger `refreshGraph`; the 10s poll is a safety net. */
export function useGraph() {
  return useSWR<Graph>(GRAPH_KEY, fetcher, { refreshInterval: 10_000, keepPreviousData: true });
}

export function useInterests(): Interest[] {
  return useSWR<Interest[]>("/api/interests", fetcher, { revalidateOnFocus: false, fallbackData: INTERESTS }).data!;
}
