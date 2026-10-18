/**
 * How long someone who left a room stays on the map as a dimmed "away" node in that group.
 * FAST_CLOCK=1 shrinks 24h to 2 minutes so it can be shown live in a demo.
 */
export function lingerMs(): number {
  return process.env.FAST_CLOCK === "1" ? 2 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

/**
 * How long a group can sit with nobody in its room before it expires (30 days; 5 minutes with FAST_CLOCK=1).
 * Members who are away don't keep it alive; only someone in the room (including minimized) does.
 */
export function vacancyMs(): number {
  return process.env.FAST_CLOCK === "1" ? 5 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

export function hourStart(d: Date = new Date()): string {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}
