import { hashString } from "@/lib/colors";

/** World-space layout helpers for the map: group anchors on a phyllotaxis spiral, loners on an outer ring. */

const SPACING = 230;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function anchorForSlot(slot: number) {
  const r = SPACING * Math.sqrt(slot);
  return { x: r * Math.cos(slot * GOLDEN), y: r * Math.sin(slot * GOLDEN) };
}

export function outerRingRadius(slotCount: number) {
  return SPACING * Math.sqrt(Math.max(slotCount, 1)) + 120;
}

export function ringPoint(id: string, radius: number) {
  const angle = ((hashString(id) % 3600) / 3600) * Math.PI * 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** Assigns each group the lowest free slot the first time it's seen, so groups never jump when others appear or expire. */
export class SlotAllocator {
  private slots = new Map<number, number>();

  sync(groupIds: number[]) {
    const live = new Set(groupIds);
    for (const id of [...this.slots.keys()]) if (!live.has(id)) this.slots.delete(id);
    const used = new Set(this.slots.values());
    for (const id of [...groupIds].sort((a, b) => a - b)) {
      if (this.slots.has(id)) continue;
      let s = 0;
      while (used.has(s)) s++;
      this.slots.set(id, s);
      used.add(s);
    }
  }

  get(groupId: number) {
    return this.slots.get(groupId);
  }

  get maxSlot() {
    return Math.max(0, ...this.slots.values()) + 1;
  }
}

/** Render-time bob (does not touch physics). */
export function bob(phase: number, t: number, enabled: boolean) {
  if (!enabled) return { dx: 0, dy: 0 };
  return { dx: Math.cos(t / 1900 + phase) * 0.8, dy: Math.sin(t / 1400 + phase) * 1.5 };
}
