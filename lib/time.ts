const fastClock = () => process.env.FAST_CLOCK === "1";

/**
 * How long an emptied group lingers on the map before it's deleted: 30 days after the last person leaves.
 * FAST_CLOCK=1 shrinks it to 2 minutes so expiry can be shown live in a demo.
 */
export function groupLingerMs(): number {
  return fastClock() ? 2 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

/** How long someone who left a room stays on the map in that bubble as "away": 30 days (2 minutes with FAST_CLOCK=1). */
export function awayMs(): number {
  return fastClock() ? 2 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

export type Linger = { groupMs: number; awayMs: number };
export const linger = (): Linger => ({ groupMs: groupLingerMs(), awayMs: awayMs() });

export function hourStart(d: Date = new Date()): string {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}
