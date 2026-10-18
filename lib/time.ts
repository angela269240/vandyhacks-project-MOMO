/**
 * How long an emptied group (and an "away" user) lingers on the map.
 * FAST_CLOCK=1 shrinks 24h to 2 minutes so expiry can be shown live in a demo.
 */
export function lingerMs(): number {
  return process.env.FAST_CLOCK === "1" ? 2 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export function hourStart(d: Date = new Date()): string {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}
