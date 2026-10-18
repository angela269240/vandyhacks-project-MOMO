"use client";

import type { RoomStatus } from "@/components/room/RoomConnection";

/**
 * One description of what the room screen is showing, instead of loose booleans:
 *   radial / radial+chat           (A, B)  the bubble with people and friendship lines
 *   presentation / presentation+chat (C, D) a shared screen with the participant strip
 * plus the lifecycle phase (connecting, live, reconnecting, failed = H, leaving = F) and whether
 * you're alone (G). Minimized (E) isn't a room-screen state: the room page isn't mounted then.
 */
export type RoomUIState = {
  phase: "connecting" | "live" | "reconnecting" | "failed" | "leaving";
  layout: "radial" | "radial+chat" | "presentation" | "presentation+chat";
  chatOpen: boolean;
  presenting: boolean;
  /** nobody else is here */
  alone: boolean;
};

export function roomUIState(input: {
  status: RoomStatus | null;
  leaving: boolean;
  chatOpen: boolean;
  shareCount: number;
  memberCount: number;
}): RoomUIState {
  const phase: RoomUIState["phase"] = input.leaving
    ? "leaving"
    : input.status === "live"
      ? "live"
      : input.status === "reconnecting"
        ? "reconnecting"
        : input.status === "failed"
          ? "failed"
          : "connecting";
  // A dropped connection can't truthfully show someone's screen.
  const presenting = input.shareCount > 0 && phase !== "failed";
  const chatOpen = input.chatOpen && phase !== "leaving";
  return {
    phase,
    layout: presenting ? (chatOpen ? "presentation+chat" : "presentation") : chatOpen ? "radial+chat" : "radial",
    chatOpen,
    presenting,
    alone: input.memberCount <= 1,
  };
}
