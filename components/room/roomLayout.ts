/**
 * Stable seats inside the room bubble, in unit-disk coordinates. You sit in the middle; everyone else
 * takes the first free seat in a spread-out order and keeps it while they stay, so nobody shuffles
 * when someone else joins, leaves or starts speaking.
 */
export type Seat = { x: number; y: number; angle: number };

const ring = (count: number, radius: number, offsetDeg: number, order: number[]): Seat[] =>
  order.map((k) => {
    const angle = ((offsetDeg + (k * 360) / count) * Math.PI) / 180;
    // a touch of deterministic wobble so the layout reads as a graph, not a clock face
    const r = radius + (((k * 37) % 7) - 3) * 0.012;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle };
  });

const CENTER: Seat = { x: 0, y: 0, angle: Math.PI / 2 };
const INNER = ring(6, 0.5, -90, [0, 3, 1, 4, 2, 5]);
const OUTER = ring(12, 0.88, -75, [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11]);
const EDGE = ring(18, 1, -85, [0, 9, 4, 13, 2, 11, 7, 16, 5, 14, 1, 10, 6, 15, 3, 12, 8, 17]);

/** Seat 0 is reserved for you; the rest fill inner ring first, alternating sides. */
export const SEATS: Seat[] = [CENTER, ...INNER, ...OUTER, ...EDGE];

/** Assigns seats, keeping existing assignments. Mutates and returns `seats`. */
export function assignSeats(seats: Map<string, number>, ids: string[], meId: string | null) {
  const present = new Set(ids);
  for (const id of [...seats.keys()]) if (!present.has(id)) seats.delete(id);
  const taken = new Set(seats.values());
  if (meId && present.has(meId) && !seats.has(meId)) {
    seats.set(meId, 0);
    taken.add(0);
  }
  for (const id of ids) {
    if (seats.has(id)) continue;
    let seat = 1;
    while (taken.has(seat)) seat++;
    seats.set(id, seat);
    taken.add(seat);
  }
  return seats;
}

/** Seats past the prepared ones (rooms over ~37 people) spiral outward instead of overlapping. */
export function seatAt(index: number): Seat {
  if (index < SEATS.length) return SEATS[index];
  const angle = index * 2.399963; // golden angle
  return { x: Math.cos(angle) * 0.95, y: Math.sin(angle) * 0.95, angle };
}
