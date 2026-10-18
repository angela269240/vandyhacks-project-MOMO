import type { ChatMessage } from "./types";

/** Direct messages are kept this long, then deleted (per message; a quiet chat disappears entirely). */
export const DM_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Newest messages a direct chat keeps, so one row can't grow without bound. */
export const MAX_DM_MESSAGES = 2000;

/**
 * The unique key for the chat between two people: both ids, sorted, so either side finds the same row.
 * Ids never contain ":".
 */
export const dmKey = (x: string, y: string) => (x < y ? `${x}:${y}` : `${y}:${x}`);

export const dmCutoff = (now: Date) => new Date(now.getTime() - DM_TTL_MS).toISOString();

/** Drops messages past the 60-day window and keeps at most the newest MAX_DM_MESSAGES. */
export const pruneDm = (messages: ChatMessage[], now: Date) => {
  const cut = dmCutoff(now);
  return messages.filter((m) => m.ts > cut).slice(-MAX_DM_MESSAGES);
};
