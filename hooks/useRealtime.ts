"use client";

import { Room, RoomEvent } from "livekit-client";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";

export type AppConfig = {
  realtime: "livekit" | "sse";
  livekitUrl: string | null;
  store: "oracle" | "memory";
  ai: { notes: boolean; summary: boolean };
};

export function useConfig() {
  return useSWR<AppConfig>("/api/config", fetcher, { revalidateOnFocus: false }).data;
}

/**
 * Subscribes to a server event channel over SSE (the fallback transport when LiveKit isn't configured).
 * In LiveKit mode group rooms receive events through their own connection, so this is a no-op there.
 */
export function useSseChannel<T>(channel: string | null, onEvent: (event: T) => void) {
  const config = useConfig();
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!channel || config?.realtime !== "sse") return;
    const es = new EventSource(`/api/events?channel=${encodeURIComponent(channel)}`);
    es.onmessage = (m) => {
      try {
        handler.current(JSON.parse(m.data) as T);
      } catch {}
    };
    return () => es.close();
  }, [channel, config?.realtime]);
}

/** Lobby events for the home map: a data-only LiveKit connection, or SSE. */
export function useLobby<T>(onEvent: (event: T) => void) {
  const config = useConfig();
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useSseChannel<T>("lobby", (e) => handler.current(e));

  useEffect(() => {
    if (config?.realtime !== "livekit" || !config.livekitUrl) return;
    const room = new Room();
    let cancelled = false;
    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        handler.current(JSON.parse(new TextDecoder().decode(payload)) as T);
      } catch {}
    });
    api<{ token: string }>("/api/livekit/token", { body: { room: "lobby" }, identity: null })
      .then(({ token }) => (cancelled ? undefined : room.connect(config.livekitUrl!, token, { autoSubscribe: false })))
      .catch((e) => console.warn("lobby connection failed", e));
    return () => {
      cancelled = true;
      room.disconnect();
    };
  }, [config?.realtime, config?.livekitUrl]);
}
