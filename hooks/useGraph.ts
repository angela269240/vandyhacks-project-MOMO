"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { INTERESTS } from "@/lib/interests";
import type { Graph, Interest } from "@/lib/types";

export const GRAPH_KEY = "/api/graph";

/** The whole map. Lobby events trigger revalidation; the 10s poll is a safety net. */
export function useGraph() {
  return useSWR<Graph>(GRAPH_KEY, fetcher, { refreshInterval: 10_000, keepPreviousData: true });
}

export function useInterests(): Interest[] {
  return useSWR<Interest[]>("/api/interests", fetcher, { revalidateOnFocus: false, fallbackData: INTERESTS }).data!;
}
