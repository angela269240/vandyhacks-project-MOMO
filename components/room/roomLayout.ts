import type { ScreenCircle } from "@/components/map/SocialGraph";

/**
 * Where the room's bubble sits on screen. The room is a true zoom into the map: the map's camera is framed so
 * the bubble fills this circle, and the room draws everyone exactly where the map does.
 */

export const HEADER_H = 68; // RoomHeader's h-[68px]
export const DOCK_H = 96; // RoomView's dock row
const INSET = 18;

/** The circle the bubble fills inside a stage of this size (stage-local pixels). */
export function stageCircle(w: number, h: number): ScreenCircle {
  return { x: w / 2, y: h / 2, r: Math.max(60, Math.min(w, h) / 2 - INSET) };
}

/**
 * Best guess at the stage's circle before the room has mounted (viewport pixels), so the zoom in from the map
 * heads straight for it. Once the stage measures itself it re-frames the camera; the two agree closely.
 */
export function expectedStageCircle(chatWidth: number): ScreenCircle {
  const w = window.innerWidth - chatWidth;
  const h = window.innerHeight - HEADER_H - DOCK_H;
  const c = stageCircle(w, h);
  return { x: c.x, y: c.y + HEADER_H, r: c.r };
}
