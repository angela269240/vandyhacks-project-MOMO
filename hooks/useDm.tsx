"use client";

import { createContext, useContext, useMemo, useState } from "react";

/** SWR key for the chat with `peerId`. */
export const dmPath = (peerId: string) => `/api/dm/${encodeURIComponent(peerId)}`;

type DmContext = {
  /** who the chat window is open with, or null when it's closed */
  peerId: string | null;
  /** bumps on every openChat, so an already-open window can pull focus instead of a second one appearing */
  focusNonce: number;
  openChat: (peerId: string) => void;
  closeChat: () => void;
};

const Ctx = createContext<DmContext | null>(null);

/**
 * One direct-chat window at a time. Opening a different person's chat switches it; opening the chat that's already
 * open never adds a window, it only refocuses the existing one.
 */
export function DmProvider({ children }: { children: React.ReactNode }) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const value = useMemo<DmContext>(
    () => ({
      peerId,
      focusNonce,
      openChat: (id) => {
        setPeerId(id);
        setFocusNonce((n) => n + 1);
      },
      closeChat: () => setPeerId(null),
    }),
    [peerId, focusNonce],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDm outside DmProvider");
  return ctx;
}
