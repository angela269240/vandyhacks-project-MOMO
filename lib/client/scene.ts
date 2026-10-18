"use client";

import type { MapApi } from "@/components/map/SocialGraph";

/**
 * Tiny shared state between the always-mounted map and the room overlay
 * (they live in the same layout, so the map keeps its simulation and camera while you're in a room).
 */
type Camera = { x: number; y: number; k: number };

type SceneEvents = {
  "pulse-group": number;
  /** room overlay is about to reveal the map again (scroll-out scrub started or exit committed) */
  "map-resume": void;
  /** the room overlay is fully covering the map */
  "map-pause": void;
  "exit-room": void;
};

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof SceneEvents, Set<Handler<never>>>();

export const sceneEvents = {
  on<K extends keyof SceneEvents>(event: K, fn: Handler<SceneEvents[K]>) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn as Handler<never>);
    return () => void handlers.get(event)!.delete(fn as Handler<never>);
  },
  emit<K extends keyof SceneEvents>(event: K, ...payload: SceneEvents[K] extends void ? [] : [SceneEvents[K]]) {
    handlers.get(event)?.forEach((fn) => (fn as Handler<unknown>)(payload[0]));
  },
};

export const scene: {
  /** camera before zooming into a group, restored when coming back out */
  cameraBeforeRoom: Camera | null;
  /** live voice levels (identity → 0..1) published by the room, read by the map every frame */
  levels: Map<string, number>;
  /** the live map, so the room can drive its camera (scroll-out scrub) */
  mapApi: MapApi | null;
} = { cameraBeforeRoom: null, levels: new Map(), mapApi: null };
