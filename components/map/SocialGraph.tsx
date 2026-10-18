"use client";

import { forceCollide } from "d3-force";
import { polygonCentroid, polygonContains, polygonHull } from "d3-polygon";
import { curveCatmullRomClosed, line } from "d3-shape";
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { HUES, initials, mixHex, rgba, type ToneKey } from "@/lib/colors";
import { assignGroupHues, groupHue, groupHues } from "@/lib/client/groupHues";
import { scene, sceneEvents } from "@/lib/client/scene";
import type { SearchMatches } from "@/lib/client/filters";
import type { Graph, GraphGroup, GraphUser } from "@/lib/types";
import { bob, BUBBLE_PADDING, clusterRadius, computeLayout, LAYOUT_GAP, ringPoint, type Layout } from "./layout";

/** A palette key plus where it's fading in from, so a change of bubble crossfades instead of snapping. */
type Tone = { key: ToneKey; from: ToneKey; at: number };

/** Theme colors the canvas needs, read from CSS variables whenever the theme flips. */
type Palette = {
  hue: Record<ToneKey, string>;
  ink: string;
  inkMuted: string;
  link: string;
  nodeInk: string;
  nodeEdge: string;
  shadow: string;
};

type NodeData = {
  id: string;
  user: GraphUser;
  /** display color: the hue of the bubble this person is shown in (stone when in none) */
  tone: Tone;
  /** resolved color for the current frame */
  color: string;
  phase: number;
  bornAt: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};
type LinkData = { key: string; source: string | NodeData; target: string | NodeData; bornAt: number };
type Camera = { x: number; y: number; k: number };
type Pt = [number, number];
/** a circle in screen pixels (viewport coordinates) */
export type ScreenCircle = { x: number; y: number; r: number };
/** what the room screen needs to draw a bubble exactly where (and as big as) the map draws it */
export type RoomSnapshot = {
  bubble: ScreenCircle | null;
  people: Map<string, { x: number; y: number; r: number; color: string }>;
};

export type MapApi = {
  zoomToGroup: (groupId: number, ms?: number) => void;
  /** fit the focused bubbles (your bubble ends up near the center) */
  fitFocused: (ms?: number) => void;
  setCamera: (c: Camera, ms?: number) => void;
  pause: () => void;
  resume: () => void;
  getCamera: () => Camera;
  /** fade everything except this group (entering a room) */
  focusGroup: (groupId: number | null) => void;
  /** room scroll-out scrub: 0 = room zoom, 1 = about to exit */
  scrub: (progress: number) => void;
  /** move the camera so this bubble fills `target` on screen (the room stage), so the room is a true zoom */
  frameGroup: (groupId: number, target: ScreenCircle, ms?: number) => void;
  /** glide to a bubble or a person, keeping the zoom (only zooming in when far out); `leftInset` is a panel covering the left edge */
  centerOn: (target: { groupId: number } | { userId: string }, leftInset?: number, ms?: number) => void;
  /** where the map is drawing this bubble and these people right now, in screen pixels */
  roomSnapshot: (groupId: number, ids: string[]) => RoomSnapshot;
};

type Props = {
  graph: Graph;
  meId: string | null;
  myGroupId: number | null;
  friendIds: string[];
  selectedId: string | null;
  focusedGroupIds: Set<number>;
  /** degrees-of-connection filter; null shows everyone */
  visibleUserIds: Set<string> | null;
  /** search matches to highlight and pull toward the middle; null when not searching */
  search: SearchMatches | null;
  /** set while inside a room: the map becomes the room (no pan/zoom, others faded, camera follows the bubble) */
  roomGroupId: number | null;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onNodeClick: (user: GraphUser) => void;
  onGroupClick: (group: GraphGroup) => void;
  onGroupDoubleClick: (group: GraphGroup, screen: { x: number; y: number }) => void;
  onBackgroundClick: () => void;
  onDropOnGroup: (group: GraphGroup) => void;
  onReady: (api: MapApi) => void;
};

const NODE_R = 42;
/** collision radius, kept from the old 28px nodes so the bigger circles still fit the same bubbles */
const COLLIDE_R = 60;
/** how hard people are pulled back into their bubble, per tick, before scaling by the sim's heat */
const ANCHOR_EASE = 0.3;
const UNFOCUSED_SCALE = 0.55;
const ARRIVED = 60; // members farther than this past their bubble's edge are still travelling
/** how long a click on a bubble waits for a second one (Windows' default double-click window is 500ms) */
const DOUBLE_CLICK_MS = 380;
const TONE_FADE_MS = 700;
/**
 * Edge opacity, per theme. Edges inside a bubble stay faint so dense groups don't turn into dark mats;
 * edges between bubbles (or to people outside any) stay a little stronger since they show cross-community ties.
 * Dark values give each line about the same contrast on charcoal as the light value has on cream
 * (pale lines on charcoal read stronger than dark lines on cream, so the numbers are lower).
 */
const EDGE_ALPHA = {
  light: { intra: 0.12, inter: 0.18, highlight: 0.75, faded: 0.04 },
  dark: { intra: 0.075, inter: 0.11, highlight: 0.5, faded: 0.025 },
} as const;
const TONE_KEYS: ToneKey[] = [...HUES.map((h) => h.key), "stone"];
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
const smoothPath = line<Pt>().curve(curveCatmullRomClosed.alpha(0.6));

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  // Round-trip through a canvas so any CSS color form (#fff, named, rgb()) comes back as #rrggbb.
  const probe = document.createElement("canvas").getContext("2d")!;
  const v = (name: string) => {
    probe.fillStyle = "#000000";
    probe.fillStyle = css.getPropertyValue(name).trim() || "#9a9288";
    return probe.fillStyle;
  };
  return {
    hue: Object.fromEntries(TONE_KEYS.map((k) => [k, v(`--hue-${k}`)])) as Record<ToneKey, string>,
    ink: v("--map-ink"),
    inkMuted: v("--map-ink-muted"),
    link: v("--map-link"),
    nodeInk: v("--map-node-ink"),
    nodeEdge: v("--map-node-edge"),
    shadow: v("--map-shadow"),
  };
}

/** Point a tone at a new key, starting a crossfade from whatever is showing now. */
function retarget(tone: Tone, key: ToneKey, t: number) {
  if (tone.key === key) return;
  tone.from = clamp01((t - tone.at) / TONE_FADE_MS) < 0.5 ? tone.from : tone.key;
  tone.key = key;
  tone.at = t;
}
const resolve = (tone: Tone, pal: Palette, t: number) =>
  mixHex(pal.hue[tone.from], pal.hue[tone.key], clamp01((t - tone.at) / TONE_FADE_MS));

export default function SocialGraph(props: Props) {
  const fgRef = useRef<ForceGraphMethods<NodeObject<NodeData>> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [data, setData] = useState<{ nodes: NodeData[]; links: LinkData[] }>({ nodes: [], links: [] });

  // Everything the per-frame callbacks read lives in refs, so the callbacks never change identity.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });
  const [nodes] = useState(() => new Map<string, NodeData>());
  const [links] = useState(() => new Map<string, LinkData>());
  const neighbors = useRef(new Map<string, Set<string>>());
  const groups = useRef(new Map<number, GraphGroup>());
  const layout = useRef<Layout>({ anchors: new Map(), ringRadius: 400, centerOnMe: true });
  const hulls = useRef(new Map<number, Pt[]>());
  /** head count per group, and where/how big each bubble is currently drawn (eased toward its target) */
  const groupSizes = useRef(new Map<number, number>());
  const drawnBubble = useRef(new Map<number, { x: number; y: number; r: number }>());
  const hoverNode = useRef<NodeData | null>(null);
  const hoverGroup = useRef<number | null>(null);
  const focus = useRef<{ groupId: number; start: number } | null>(null);
  const pulses = useRef(new Map<number, number>());
  const images = useRef(new Map<string, HTMLImageElement>());
  /** `bounded`: someone else's circle, which can be rearranged but never leaves its bubble */
  const drag = useRef<{ node: NodeData; startX: number; startY: number; moved: boolean; bounded: boolean } | null>(null);
  const groupDrag = useRef<{
    groupId: number;
    startX: number;
    startY: number;
    lastGraphX: number;
    lastGraphY: number;
    moved: boolean;
  } | null>(null);
  const groupOffsets = useRef(new Map<number, { x: number; y: number }>());
  const suppressClick = useRef(false);
  const pendingClick = useRef<{ groupId: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cardPlacement = useRef<{ id: string; side: "left" | "right" } | null>(null);
  const scrubBase = useRef<number | null>(null);
  const motionOK = useRef(true);
  const paused = useRef(false);
  const fonts = useRef({ sans: "sans-serif", heading: "sans-serif" });
  const groupTones = useRef(new Map<number, Tone>());
  const frame = useRef({
    t: 0,
    light: false,
    pal: null as Palette | null,
    highlight: null as Set<string> | null,
    vivid: null as Set<string> | null,
    ringed: null as Set<string> | null,
    fade: 0,
    /** a search with at least one match is on: matches stand out, everything else dims */
    searching: false,
  });
  const searchHit = (n: NodeData) => {
    const s = propsRef.current.search;
    return !!s && (s.userIds.has(n.id) || (n.user.groupId !== null && s.groupIds.has(n.user.groupId)));
  };

  const isVisible = (n: NodeData) => {
    const v = propsRef.current.visibleUserIds;
    return !v || v.has(n.id);
  };
  const isFocused = (n: NodeData) => n.user.groupId === null || propsRef.current.focusedGroupIds.has(n.user.groupId);
  /** A node wears the hue of the bubble it's displayed in; identity, interests and friendships are untouched. */
  const toneFor = (u: GraphUser): ToneKey => {
    if (u.groupId === null) return "stone";
    const g = groups.current.get(u.groupId);
    return g ? groupHue(g) : "stone";
  };
  /** how big a bubble should be for its head count (the same size the layout reserves for it) */
  const bubbleRadius = useCallback((groupId: number) => {
    const scale = propsRef.current.focusedGroupIds.has(groupId) ? 1 : UNFOCUSED_SCALE;
    return clusterRadius(groupSizes.current.get(groupId) ?? 0, scale);
  }, []);
  /** how far from the anchor members may drift while still sitting inside the bubble outline */
  const memberSpread = useCallback(
    (groupId: number) => {
      const scale = propsRef.current.focusedGroupIds.has(groupId) ? 1 : UNFOCUSED_SCALE;
      return Math.max(0, bubbleRadius(groupId) - (BUBBLE_PADDING + NODE_R) * scale);
    },
    [bubbleRadius],
  );

  /** where the bubble is drawn right now in world space (or where it will be, before its first frame) */
  const bubbleWorld = useCallback(
    (groupId: number) => {
      const drawn = drawnBubble.current.get(groupId);
      if (drawn) return { ...drawn };
      const a = layout.current.anchors.get(groupId);
      return a ? { x: a.x, y: a.y, r: bubbleRadius(groupId) } : null;
    },
    [bubbleRadius],
  );

  const targetFor = useCallback((n: NodeData) => {
    const L = layout.current;
    if (n.user.groupId !== null) {
      const a = L.anchors.get(n.user.groupId);
      if (a) return a;
    }
    if (n.id === propsRef.current.meId && L.centerOnMe) return { x: 0, y: 0 };
    return ringPoint(n.id, L.ringRadius);
  }, []);

  // ---- setup ----
  useEffect(() => {
    motionOK.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    fonts.current = {
      sans: css.getPropertyValue("--font-inter").trim() || "sans-serif",
      heading: css.getPropertyValue("--font-grotesk").trim() || "sans-serif",
    };
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    resize();
    window.addEventListener("resize", resize);
    const off = sceneEvents.on("pulse-group", (id) => pulses.current.set(id, performance.now()));
    return () => {
      window.removeEventListener("resize", resize);
      off();
    };
  }, []);

  const applyCollide = useCallback(() => {
    fgRef.current?.d3Force(
      "collide",
      forceCollide<NodeData>((n) => (isFocused(n) ? COLLIDE_R : COLLIDE_R * UNFOCUSED_SCALE)) as never,
    );
  }, []);  

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    let anchored: NodeData[] = [];
    const anchor = Object.assign(
      (alpha: number) => {
        // Floored so people crossing the map to a bubble's new spot (e.g. after joining a group reshuffles the
        // layout) still arrive once the sim cools, instead of stalling against other bubbles mid-way.
        const pull = ANCHOR_EASE * Math.max(alpha, 0.12);
        const hits = propsRef.current.search?.userIds;
        const view = hits?.size ? fgRef.current?.centerAt() : undefined;
        for (const n of anchored) {
          if (n.fx !== undefined) continue;
          let t = targetFor(n);
          // Bubble members float freely inside their bubble (so a bigger group spreads out and fills a bigger one);
          // only the part of the distance beyond that free zone is pulled in.
          let free = n.user.groupId === null ? 0 : memberSpread(n.user.groupId);
          if (view && n.user.groupId !== null && hits!.has(n.id)) {
            // A search match drifts to the spot in its bubble nearest the middle of the screen, never past the edge.
            const ox = view.x - t.x;
            const oy = view.y - t.y;
            const reach = Math.min(1, free / Math.max(Math.hypot(ox, oy), 1));
            t = { x: t.x + ox * reach, y: t.y + oy * reach };
            free = 0;
          }
          const dx = t.x - (n.x ?? 0);
          const dy = t.y - (n.y ?? 0);
          const d = Math.hypot(dx, dy);
          if (d <= free) continue;
          const k = (pull * (d - free)) / d;
          n.vx = (n.vx ?? 0) + dx * k;
          n.vy = (n.vy ?? 0) + dy * k;
        }
      },
      { initialize: (ns: NodeData[]) => (anchored = ns) },
    );
    fg.d3Force("center", null);
    fg.d3Force("charge")?.strength(-160).distanceMax(320);
    applyCollide();
    fg.d3Force("link")
      ?.distance(110)
      .strength((l: LinkData) => {
        const s = l.source as NodeData;
        const t = l.target as NodeData;
        return s.user?.groupId !== null && s.user?.groupId === t.user?.groupId ? 0.08 : 0.01;
      });
    fg.d3Force("anchor", anchor as never);
    fg.d3ReheatSimulation();

    const groupNodes = (groupId: number) => [...nodes.values()].filter((n) => n.user.groupId === groupId && isVisible(n));
    propsRef.current.onReady({
      zoomToGroup: (groupId, ms = 600) => {
        if (groupNodes(groupId).length) {
          fg.zoomToFit(ms, 170, (n) => (n as NodeData).user.groupId === groupId && isVisible(n as NodeData));
        } else {
          const a = layout.current.anchors.get(groupId) ?? { x: 0, y: 0 };
          fg.centerAt(a.x, a.y, ms);
          fg.zoom(2.5, ms);
        }
      },
      fitFocused: (ms = 700) => {
        // Fit the focused bubbles plus you, without zooming in absurdly far on a single bubble.
        const filter = (n: NodeObject<NodeData>) => {
          const node = n as NodeData;
          if (!isVisible(node)) return false;
          if (node.id === propsRef.current.meId) return true;
          return node.user.groupId !== null && isFocused(node);
        };
        if (![...nodes.values()].some(filter)) return;
        const box = fg.getGraphBbox(filter);
        const padX = 140;
        const padY = 190; // room for the top bar and the degrees slider below
        const w = Math.max(box.x[1] - box.x[0], 1);
        const h = Math.max(box.y[1] - box.y[0], 1);
        const k = Math.min(1.6, Math.max(0.15, Math.min((size.w - padX * 2) / w, (size.h - padY * 2) / h)));
        fg.centerAt((box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2 + 10 / k, ms);
        fg.zoom(k, ms);
      },
      setCamera: (c, ms = 800) => {
        fg.centerAt(c.x, c.y, ms);
        fg.zoom(c.k, ms);
      },
      getCamera: () => ({ ...fg.centerAt(), k: fg.zoom() }),
      pause: () => {
        paused.current = true;
        fg.pauseAnimation();
      },
      resume: () => {
        fg.resumeAnimation();
        if (!paused.current) return;
        paused.current = false;
        // A fresh push after a room: bubbles are often mid-move when the pause catches them (joining a group
        // reshuffles the layout right as the room opens), and the sim may have cooled since.
        fg.d3ReheatSimulation();
      },
      focusGroup: (groupId) => (focus.current = groupId === null ? null : { groupId, start: performance.now() }),
      scrub: (progress) => {
        if (progress <= 0) {
          if (scrubBase.current !== null) fg.zoom(scrubBase.current, 300);
          scrubBase.current = null;
          return;
        }
        scrubBase.current ??= fg.zoom();
        fg.zoom(scrubBase.current * (1 - 0.45 * progress), 0);
      },
      frameGroup: (groupId, target, ms = 500) => {
        const b = bubbleWorld(groupId);
        if (!b) return;
        const k = Math.min(6, Math.max(0.15, target.r / b.r));
        // the world point that has to sit at the middle of the viewport for the bubble to land on `target`
        fg.centerAt(b.x - (target.x - size.w / 2) / k, b.y - (target.y - size.h / 2) / k, ms);
        fg.zoom(k, ms);
      },
      centerOn: (target, leftInset = 0, ms = 700) => {
        // Aim at where the bubble is headed, not where it is: a search match is being moved to the middle of the layout.
        const n = "userId" in target ? nodes.get(target.userId) : undefined;
        const groupId = "groupId" in target ? target.groupId : (n?.user.groupId ?? null);
        const p = (groupId !== null && layout.current.anchors.get(groupId)) || (n && { x: n.x ?? 0, y: n.y ?? 0 });
        if (!p) return;
        const k = Math.max(fg.zoom(), "userId" in target ? 0.45 : 0.3);
        fg.centerAt(p.x - leftInset / 2 / k, p.y, ms);
        fg.zoom(k, ms);
      },
      roomSnapshot: (groupId, ids) => {
        const k = fg.zoom();
        const b = bubbleWorld(groupId);
        const c = b && fg.graph2ScreenCoords(b.x, b.y);
        const people = new Map<string, { x: number; y: number; r: number; color: string }>();
        for (const id of ids) {
          const n = nodes.get(id);
          if (!n || n.x === undefined) continue;
          // the same bob the map draws this frame (renderPos, inlined: it's declared further down)
          const wobble = bob(n.phase, frame.current.t, motionOK.current);
          const p = fg.graph2ScreenCoords(n.x + wobble.dx, (n.y ?? 0) + wobble.dy);
          const r = NODE_R * (isFocused(n) ? 1 : UNFOCUSED_SCALE) * (id === propsRef.current.meId ? 1.3 : 1) * k;
          people.set(id, { x: p.x, y: p.y, r, color: n.color });
        }
        return { bubble: b && c ? { x: c.x, y: c.y, r: b.r * k } : null, people };
      },
    });
  }, [size.w, size.h, targetFor, nodes, applyCollide, memberSpread, bubbleWorld]);

  // ---- layout: focused bubbles in the middle (mine at the center), the rest in a side strip ----
  const focusKey = [...props.focusedGroupIds].sort((a, b) => a - b).join(",");
  // group ids plus head counts, so the layout makes room when a bubble grows
  const groupKey = props.graph.groups.map((g) => `${g.id}:${props.graph.users.filter((u) => u.groupId === g.id).length}`).join(",");
  // matched bubbles take the middle; matched people don't move bubbles, so only group matches count here
  const searchKey = props.search ? [...props.search.groupIds].sort((a, b) => a - b).join(",") : "";
  const arrangedFor = useRef<string | null>(null);
  useEffect(() => {
    const ids = props.graph.groups.map((g) => g.id);
    const focused = ids.filter((id) => props.focusedGroupIds.has(id));
    const unfocused = ids.filter((id) => !props.focusedGroupIds.has(id));
    const sizes = new Map<number, number>();
    for (const u of props.graph.users) if (u.groupId !== null) sizes.set(u.groupId, (sizes.get(u.groupId) ?? 0) + 1);
    groupSizes.current = sizes;

    // Joining, entering or leaving a room changes which bubble is "mine" and nudges head counts. Re-centering
    // on that would send every bubble flying (and fight the room zoom), so keep the current spots as long as
    // the same bubbles are shown in the same arrangement and none of them now overlap.
    const arrangement = `${ids.join(",")}|${focusKey}|${searchKey}`;
    const prev = layout.current;
    const keep =
      arrangedFor.current === arrangement &&
      ids.every((id) => prev.anchors.has(id)) &&
      focused.every((a, i) =>
        focused.slice(i + 1).every((b) => {
          const pa = prev.anchors.get(a)!;
          const pb = prev.anchors.get(b)!;
          const need = clusterRadius(sizes.get(a) ?? 1) + clusterRadius(sizes.get(b) ?? 1) + LAYOUT_GAP / 2;
          return Math.hypot(pa.x - pb.x, pa.y - pb.y) >= need;
        }),
      );
    arrangedFor.current = arrangement;
    if (!keep) {
      const priority = props.search ? ids.filter((id) => props.search!.groupIds.has(id)) : [];
      layout.current = computeLayout(focused, unfocused, props.myGroupId, sizes, UNFOCUSED_SCALE, priority);
      for (const [id, offset] of groupOffsets.current) {
        const anchor = layout.current.anchors.get(id);
        if (anchor) layout.current.anchors.set(id, { x: anchor.x + offset.x, y: anchor.y + offset.y });
      }
    }
    // Bubble colors come from the unfiltered layout, so neighbors differ and filters never recolor anything.
    const full = computeLayout(ids, [], props.myGroupId, sizes, UNFOCUSED_SCALE);
    groupHues.set(assignGroupHues(props.graph.groups, full.anchors, groupHues.get()));
    applyCollide();
    fgRef.current?.d3ReheatSimulation();
  }, [focusKey, groupKey, searchKey, props.myGroupId, props.meId, applyCollide]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new set of matched people needs a push so they drift toward the middle (the sim may have cooled)
  const searchUserKey = props.search ? [...props.search.userIds].sort().join(",") : "";
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [searchUserKey]);

  // ---- sync server graph into persistent node/link objects (keeps positions across updates) ----
  useEffect(() => {
    const { graph } = props;
    const now = performance.now();
    const initial = nodes.size === 0;
    groups.current = new Map(graph.groups.map((g) => [g.id, g]));

    let structural = false;
    let moved = false;
    const seen = new Set<string>();
    for (const u of graph.users) {
      seen.add(u.id);
      const existing = nodes.get(u.id);
      if (!existing) {
        const key = toneFor(u);
        const node: NodeData = {
          id: u.id,
          user: u,
          tone: { key, from: key, at: 0 },
          color: "",
          phase: Math.random() * Math.PI * 2,
          bornAt: initial ? 0 : now,
        };
        const t = targetFor(node);
        node.x = t.x + (Math.random() - 0.5) * 80;
        node.y = t.y + (Math.random() - 0.5) * 80;
        nodes.set(u.id, node);
        structural = true;
      } else {
        if (existing.user.groupId !== u.groupId) {
          moved = true;
          // a server-side move releases a node you pinned by dragging
          existing.fx = existing.fy = undefined;
        }
        existing.user = u;
      }
    }
    for (const id of [...nodes.keys()]) {
      if (seen.has(id)) continue;
      nodes.delete(id);
      structural = true;
    }

    const seenLinks = new Set<string>();
    const nbrs = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!nodes.has(e.source) || !nodes.has(e.target)) continue;
      const key = pairKey(e.source, e.target);
      seenLinks.add(key);
      if (!links.has(key)) {
        links.set(key, { key, source: e.source, target: e.target, bornAt: initial ? 0 : now });
        structural = true;
      }
      if (!nbrs.has(e.source)) nbrs.set(e.source, new Set());
      if (!nbrs.has(e.target)) nbrs.set(e.target, new Set());
      nbrs.get(e.source)!.add(e.target);
      nbrs.get(e.target)!.add(e.source);
    }
    for (const key of [...links.keys()]) {
      if (seenLinks.has(key)) continue;
      links.delete(key);
      structural = true;
    }
    neighbors.current = nbrs;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- node objects are long-lived and mutated by d3
    if (structural) setData({ nodes: [...nodes.values()], links: [...links.values()] });
    else if (moved) fgRef.current?.d3ReheatSimulation();
  }, [props.graph, nodes, links, targetFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entering/leaving a room fades everything else.
  useEffect(() => {
    const id = props.roomGroupId;
    if (id === null) focus.current = null;
    else if (focus.current?.groupId !== id) focus.current = { groupId: id, start: performance.now() };
    scrubBase.current = null;
  }, [props.roomGroupId]);

  const renderPos = (n: NodeData) => {
    const b = bob(
      n.phase,
      frame.current.t,
      motionOK.current && drag.current?.node !== n && groupDrag.current?.groupId !== n.user.groupId,
    );
    return { x: (n.x ?? 0) + b.dx, y: (n.y ?? 0) + b.dy };
  };

  // ---- per-frame: focus state + group blobs (drawn under links and nodes) ----
  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D, gs: number) => {
      const t = performance.now();
      const f = frame.current;
      f.t = t;
      const light = document.documentElement.classList.contains("light");
      if (!f.pal || light !== f.light) f.pal = readPalette();
      f.light = light;
      const pal = f.pal;

      // Resolve this frame's colors: bubbles from the shared assignment, people from the bubble they're shown in.
      const hues = groupHues.get();
      for (const g of groups.current.values()) {
        const key = groupHue(g, hues);
        const tone = groupTones.current.get(g.id);
        if (!tone) groupTones.current.set(g.id, { key, from: key, at: 0 });
        else retarget(tone, key, t);
      }
      for (const n of nodes.values()) {
        retarget(n.tone, toneFor(n.user), t);
        n.color = resolve(n.tone, pal, t);
      }

      const { meId, friendIds, selectedId, roomGroupId } = propsRef.current;
      const friends = new Set(friendIds);
      const hover = hoverNode.current?.id ?? null;
      const nb = (id: string) => neighbors.current.get(id) ?? new Set<string>();

      f.highlight = f.vivid = f.ringed = null;
      if (hover && !drag.current) {
        f.highlight = new Set([hover, ...nb(hover)]);
        f.vivid = new Set([...nb(hover)].map((o) => pairKey(hover, o)));
      } else if (selectedId) {
        const mutual = [...nb(selectedId)].filter((id) => friends.has(id));
        f.highlight = new Set([selectedId, ...mutual, ...(meId ? [meId] : [])]);
        f.vivid = new Set(mutual.map((o) => pairKey(selectedId, o)));
        if (meId && friends.has(selectedId)) f.vivid.add(pairKey(selectedId, meId));
        f.ringed = new Set(mutual);
      }
      const fg = focus.current;
      f.fade = fg ? clamp01((t - fg.start) / 400) : 0;
      const search = propsRef.current.search;
      f.searching = !!search && search.groupIds.size + search.userIds.size > 0;

      const byGroup = new Map<number, NodeData[]>();
      for (const n of nodes.values()) {
        if (n.user.groupId === null || !isVisible(n) || (drag.current?.node === n && !drag.current.bounded)) continue;
        if (!byGroup.has(n.user.groupId)) byGroup.set(n.user.groupId, []);
        byGroup.get(n.user.groupId)!.push(n);
      }

      hulls.current = new Map();
      for (const g of groups.current.values()) {
        const focusedGroup = propsRef.current.focusedGroupIds.has(g.id);
        const scale = focusedGroup ? 1 : UNFOCUSED_SCALE;
        const pad = BUBBLE_PADDING * scale;
        // Someone still travelling over from elsewhere joins the blob once they arrive.
        const home = layout.current.anchors.get(g.id) ?? null;
        const all = byGroup.get(g.id) ?? [];
        const arrived = home ? all.filter((m) => Math.hypot((m.x ?? 0) - home.x, (m.y ?? 0) - home.y) < bubbleRadius(g.id) + ARRIVED) : all;
        const members = arrived.length ? arrived : all;
        let pts: Pt[] = [];
        if (members.length) {
          // Centered on the spot the layout reserved for it (members float freely inside, so their centroid wanders),
          // and at least the size its head count calls for, so the bubble grows as people join. Both are eased, so
          // it swells and glides instead of snapping when someone joins or the layout reshuffles.
          const tx = home?.x ?? members.reduce((sum, m) => sum + (m.x ?? 0), 0) / members.length;
          const ty = home?.y ?? members.reduce((sum, m) => sum + (m.y ?? 0), 0) / members.length;
          const spread = Math.max(...members.map((m) => Math.hypot((m.x ?? 0) - tx, (m.y ?? 0) - ty))) + pad;
          const tr = Math.max(spread, bubbleRadius(g.id));
          const prev = drawnBubble.current.get(g.id);
          const ease = prev && motionOK.current ? 0.08 : 1;
          const b = prev ?? { x: tx, y: ty, r: tr };
          b.x += (tx - b.x) * ease;
          b.y += (ty - b.y) * ease;
          b.r += (tr - b.r) * ease;
          drawnBubble.current.set(g.id, b);
          pts = Array.from({ length: 32 }, (_, i) => {
            const a = (i / 32) * Math.PI * 2;
            return [b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r] as Pt;
          });
        } else {
          const c = home ?? { x: 0, y: 0 };
          const r = 60 * scale;
          pts = Array.from({ length: 16 }, (_, i) => [c.x + Math.cos((i / 16) * Math.PI * 2) * r, c.y + Math.sin((i / 16) * Math.PI * 2) * r] as Pt);
        }
        const hull = polygonHull(pts);
        if (!hull) continue;
        hulls.current.set(g.id, hull);
        const [cx, cy] = polygonCentroid(hull);
        let r = 0;
        let top = Infinity;
        for (const [x, y] of hull) {
          r = Math.max(r, Math.hypot(x - cx, y - cy));
          top = Math.min(top, y);
        }

        const hovered = hoverGroup.current === g.id && !hoverNode.current && roomGroupId === null;
        const isFocus = fg?.groupId === g.id;
        const matched = f.searching && search!.groupIds.has(g.id);
        const alpha = (fg ? (isFocus ? 1 : 1 - f.fade) : 1) * (focusedGroup ? 1 : 0.55) * (f.searching && !matched ? 0.4 : 1);
        if (alpha <= 0.01) continue;
        const pulseAt = pulses.current.get(g.id);
        const pulse = pulseAt ? clamp01(1 - (t - pulseAt) / 1100) : 0;
        const color = resolve(groupTones.current.get(g.id)!, pal, t);
        // Flat, paper-like tint: a little denser in the middle, a clean edge, no glow.
        const fillCore = (focusedGroup ? (f.light ? 0.15 : 0.13) + (hovered || isFocus ? 0.07 : 0) : 0.07) + (matched ? 0.09 : 0);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        smoothPath.context(ctx)(hull);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgba(color, fillCore + pulse * 0.08));
        grad.addColorStop(1, rgba(color, fillCore * 0.55));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = ((focusedGroup ? 1.3 + pulse * 2 + (isFocus ? 0.5 : 0) : 1) + (matched ? 1.7 : 0)) / Math.max(gs, 0.5);
        ctx.strokeStyle = rgba(color, (focusedGroup ? 0.5 : 0.3) + (hovered ? 0.25 : 0) + pulse * 0.4 + (isFocus ? 0.2 : 0) + (matched ? 0.4 : 0));
        if (!members.length) ctx.setLineDash([6 / gs, 6 / gs]);
        ctx.stroke();
        ctx.restore();

        // named once the bubble is big enough on screen to carry a label (bigger groups keep theirs further out)
        if (r * gs > 24 && !(roomGroupId === g.id)) {
          ctx.save();
          ctx.globalAlpha = alpha * (hovered ? 1 : 0.75);
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.font = `600 ${(focusedGroup ? 15 : 12) / gs}px ${fonts.current.heading}`;
          ctx.fillStyle = pal.ink;
          ctx.fillText(g.name, cx, top - 6 / gs);
          if (focusedGroup) {
            ctx.font = `500 ${10.5 / gs}px ${fonts.current.sans}`;
            ctx.fillStyle = pal.inkMuted;
            const here = g.activeCount ? `${g.activeCount} here now` : "empty · fading in 24h";
            ctx.fillText(`${g.category} · ${here}`, cx, top - 6 / gs - 17 / gs);
          }
          ctx.restore();
        }
      }
    },
    [nodes, bubbleRadius],
  );

  const nodeCanvasObject = useCallback((obj: NodeObject<NodeData>, ctx: CanvasRenderingContext2D, gs: number) => {
    const n = obj as NodeData;
    const f = frame.current;
    const { meId, selectedId } = propsRef.current;
    let { x, y } = renderPos(n);
    const hovered = hoverNode.current?.id === n.id;
    const selected = selectedId === n.id;
    const focused = isFocused(n);

    let alpha = focused ? 1 : 0.7;
    if (f.highlight && !f.highlight.has(n.id)) alpha *= 0.35;
    const hit = f.searching && searchHit(n);
    if (f.searching && !hit) alpha *= 0.3;
    if (n.user.away) alpha *= 0.5;
    if (focus.current && n.user.groupId !== focus.current.groupId && n.id !== meId) alpha *= 1 - f.fade;
    if (alpha <= 0.01) return;

    // Trembles while talking (levels come from the room's voice connection).
    const level = scene.levels.get(n.id) ?? 0;
    if (level > 0.01 && motionOK.current) {
      const a = (1 + level * 5) / Math.max(gs, 1) * 1.6;
      x += (Math.random() * 2 - 1) * a;
      y += (Math.random() * 2 - 1) * a;
    }

    const born = n.bornAt ? clamp01((f.t - n.bornAt) / 650) : 1;
    const isMe = n.id === meId;
    const base = NODE_R * (focused ? 1 : UNFOCUSED_SCALE) * (isMe ? 1.3 : 1);
    const r = base * (hovered || selected ? 1.2 : 1) * Math.max(0, easeOutBack(born)) * (drag.current?.node === n ? 1.15 : 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (born < 1) {
      ctx.beginPath();
      ctx.arc(x, y, base * (1 + born * 3), 0, Math.PI * 2);
      ctx.fillStyle = rgba(n.color, 0.35 * (1 - born));
      ctx.fill();
    }
    if (level > 0.01) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 + level * 14, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(n.color, 0.35 + level * 0.6);
      ctx.lineWidth = 2 / gs;
      ctx.stroke();
    }

    const pal = f.pal!;
    // Flat disc with a soft drop shadow (depth, not glow) and a thin rim in the paper color.
    if (!n.user.away && focused) {
      ctx.shadowColor = pal.shadow;
      ctx.shadowBlur = hovered || selected ? 12 : 6;
      ctx.shadowOffsetY = hovered || selected ? 3 : 1.5;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1.5 / gs;
    ctx.strokeStyle = rgba(pal.nodeEdge, 0.85);
    ctx.stroke();

    const img = n.user.avatarUrl ? images.current.get(n.user.avatarUrl) : undefined;
    if (n.user.avatarUrl && !img) {
      const el = new Image();
      el.src = n.user.avatarUrl;
      images.current.set(n.user.avatarUrl, el);
    }
    if (gs > 2 && img?.complete && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else if (r * gs > 9) {
      ctx.font = `600 ${r * 0.78}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(pal.nodeInk, 0.92);
      ctx.fillText(initials(n.user.name), x, y + r * 0.05);
    }

    if (isMe) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 2 / gs;
      ctx.strokeStyle = pal.ink;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r + 8 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / gs;
      ctx.strokeStyle = rgba(n.color, 0.9);
      ctx.stroke();
    }
    if (hit && propsRef.current.search!.userIds.has(n.id)) {
      // a matched person: a bold ring in their bubble's color
      ctx.beginPath();
      ctx.arc(x, y, r + (isMe ? 13 : 6) / gs, 0, Math.PI * 2);
      ctx.lineWidth = 3 / gs;
      ctx.strokeStyle = rgba(n.color, 0.95);
      ctx.stroke();
    }
    if (f.ringed?.has(n.id)) {
      ctx.beginPath();
      ctx.arc(x, y, r + (isMe ? 11 : 5) / gs, 0, Math.PI * 2);
      ctx.lineWidth = 1.4 / gs;
      ctx.strokeStyle = rgba(n.color, 0.75);
      ctx.stroke();
    }

    if (focused && (hovered || selected || n.id === meId || gs > 1.1)) {
      ctx.font = `500 ${11.5 / gs}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = rgba(pal.ink, 0.88);
      const label = n.id === meId ? `${n.user.name} (you)` : n.user.name;
      ctx.fillText(label, x, y + r + 5 / gs);
    }
    ctx.restore();
  }, []);  

  const linkCanvasObject = useCallback((obj: object, ctx: CanvasRenderingContext2D, gs: number) => {
    const l = obj as LinkData;
    const s = l.source;
    const e = l.target;
    if (typeof s !== "object" || typeof e !== "object") return;
    const f = frame.current;
    const a = renderPos(s);
    const b = renderPos(e);
    const vivid = f.vivid?.has(l.key) ?? false;

    // Hovering (or selecting) someone lifts their own edges and fades the rest.
    const A = f.light ? EDGE_ALPHA.light : EDGE_ALPHA.dark;
    const sameGroup = s.user.groupId !== null && s.user.groupId === e.user.groupId;
    let alpha = f.highlight ? (vivid ? A.highlight : A.faded) : sameGroup ? A.intra : A.inter;
    if (s.user.away || e.user.away) alpha *= 0.6;
    if (!isFocused(s) || !isFocused(e)) alpha *= 0.5;
    if (f.searching && !searchHit(s) && !searchHit(e)) alpha *= 0.35;
    if (focus.current && (s.user.groupId !== focus.current.groupId || e.user.groupId !== focus.current.groupId)) {
      alpha *= 1 - f.fade;
    }
    if (alpha <= 0.01) return;

    const p = l.bornAt ? clamp01((f.t - l.bornAt) / 800) : 1;
    const end = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    if (vivid || p < 1) {
      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, s.color);
      grad.addColorStop(1, e.color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, 1.6 / gs);
      ctx.lineCap = "round";
    } else {
      ctx.strokeStyle = f.pal?.link ?? "#c8bfb2";
      ctx.lineWidth = Math.max(1, 0.8 / gs);
    }
    ctx.stroke();
    ctx.restore();
  }, []);  

  const onRenderFramePost = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // In a room the room stage frames the camera (frameGroup), so the map never drifts under it.
    const { selectedId, cardRef } = propsRef.current;

    // Keep the profile card glued to its (bobbing, panning) node.
    const card = cardRef.current;
    if (!selectedId || !card) return;
    const n = nodes.get(selectedId);
    if (!n) return;
    const pos = renderPos(n);
    const p = fg.graph2ScreenCoords(pos.x, pos.y);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (cardPlacement.current?.id !== selectedId) {
      cardPlacement.current = { id: selectedId, side: p.x > window.innerWidth / 2 ? "left" : "right" };
    }
    const side = cardPlacement.current.side;
    const preferredX = side === "right" ? p.x + NODE_R + 16 : p.x - NODE_R - 16 - w;
    const x = Math.max(12, Math.min(preferredX, window.innerWidth - w - 12));
    const y = Math.max(120, Math.min(p.y - h / 2, window.innerHeight - h - 12));
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [nodes]);  

  const groupAt = (sx: number, sy: number) => {
    const fg = fgRef.current;
    if (!fg) return null;
    const { x, y } = fg.screen2GraphCoords(sx, sy);
    const edgeTolerance = 12 / fg.zoom();
    const distanceToEdge = (a: Pt, b: Pt) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared)) : 0;
      return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
    };
    for (const [id, hull] of hulls.current) {
      if (polygonContains(hull, [x, y])) return id;
      if (hull.some((point, i) => distanceToEdge(point, hull[(i + 1) % hull.length]) <= edgeTolerance)) return id;
    }
    return null;
  };

  const localPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const nodeAt = (sx: number, sy: number) => {
    const fg = fgRef.current;
    if (!fg) return null;
    const point = fg.screen2GraphCoords(sx, sy);
    for (const n of [...nodes.values()].reverse()) {
      if (!isVisible(n)) continue;
      const pos = renderPos(n);
      const scale = isFocused(n) ? 1 : UNFOCUSED_SCALE;
      const radius = NODE_R * scale * (n.id === propsRef.current.meId ? 1.3 : 1) * 1.2;
      if (Math.hypot(point.x - pos.x, point.y - pos.y) <= radius) return n;
    }
    return null;
  };
  const inRoom = props.roomGroupId !== null;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      // Your circle and whole bubbles can move independently; neither gesture pans the camera.
      onPointerDownCapture={(e) => {
        const fg = fgRef.current;
        if (inRoom || !fg || e.button !== 0) return;
        const p = localPoint(e);
        const hitNode = nodeAt(p.x, p.y);
        if (hitNode) {
          const isMe = hitNode.id === propsRef.current.meId;
          // other people only move within their bubble; someone outside every bubble stays put
          if (!isMe && hitNode.user.groupId === null) return;
          drag.current = { node: hitNode, startX: e.clientX, startY: e.clientY, moved: false, bounded: !isMe };
          // others are captured once the drag starts, so a plain click still opens their profile
          if (isMe) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        const groupId = groupAt(p.x, p.y);
        if (groupId === null) return;
        const point = fg.screen2GraphCoords(p.x, p.y);
        groupDrag.current = {
          groupId,
          startX: e.clientX,
          startY: e.clientY,
          lastGraphX: point.x,
          lastGraphY: point.y,
          moved: false,
        };
      }}
      onWheelCapture={(e) => {
        if (inRoom) return;
        const delta = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
        if (Math.abs(delta) <= Math.abs(e.deltaY) && !e.shiftKey) return;
        const fg = fgRef.current;
        if (!fg) return;
        e.preventDefault();
        e.stopPropagation();
        const camera = fg.centerAt();
        fg.centerAt(camera.x + delta / fg.zoom(), camera.y, 0);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const fg = fgRef.current;
        if (d && fg) {
          if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
            d.moved = true;
            if (d.bounded) {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              fg.d3ReheatSimulation(); // so neighbours get nudged aside instead of overlapping
            }
          }
          if (d.moved) {
            const p = localPoint(e);
            const g = fg.screen2GraphCoords(p.x, p.y);
            let { x, y } = g;
            const groupId = d.node.user.groupId;
            const home = groupId === null ? undefined : layout.current.anchors.get(groupId);
            if (d.bounded && groupId !== null && home) {
              // clamp to the free zone the anchor force leaves alone, so the circle stays inside the outline
              const spread = memberSpread(groupId);
              const dist = Math.hypot(x - home.x, y - home.y);
              if (dist > spread) {
                const k = spread / dist;
                x = home.x + (x - home.x) * k;
                y = home.y + (y - home.y) * k;
              }
            }
            d.node.fx = d.node.x = x;
            d.node.fy = d.node.y = y;
            hoverGroup.current = d.bounded ? null : groupAt(p.x, p.y);
            wrapRef.current!.style.cursor = "grabbing";
          }
          return;
        }
        const gd = groupDrag.current;
        if (gd && fg) {
          if (!gd.moved && Math.hypot(e.clientX - gd.startX, e.clientY - gd.startY) > 4) {
            gd.moved = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (gd.moved) {
            const p = localPoint(e);
            const point = fg.screen2GraphCoords(p.x, p.y);
            const dx = point.x - gd.lastGraphX;
            const dy = point.y - gd.lastGraphY;
            gd.lastGraphX = point.x;
            gd.lastGraphY = point.y;

            const anchor = layout.current.anchors.get(gd.groupId);
            if (anchor) layout.current.anchors.set(gd.groupId, { x: anchor.x + dx, y: anchor.y + dy });
            const offset = groupOffsets.current.get(gd.groupId) ?? { x: 0, y: 0 };
            groupOffsets.current.set(gd.groupId, { x: offset.x + dx, y: offset.y + dy });
            const drawn = drawnBubble.current.get(gd.groupId); // the outline follows the drag 1:1, no easing lag
            if (drawn) Object.assign(drawn, { x: drawn.x + dx, y: drawn.y + dy });
            for (const n of nodes.values()) {
              if (n.user.groupId !== gd.groupId) continue;
              n.x = (n.x ?? 0) + dx;
              n.y = (n.y ?? 0) + dy;
              if (n.fx !== undefined) n.fx += dx;
              if (n.fy !== undefined) n.fy += dy;
            }
            wrapRef.current!.style.cursor = "grabbing";
          }
          return;
        }
        const p = localPoint(e);
        hoverGroup.current = inRoom ? null : groupAt(p.x, p.y);
        const h = hoverNode.current;
        const overDraggable = !inRoom && !!h && (h.id === propsRef.current.meId || h.user.groupId !== null);
        const overGroup = !h && hoverGroup.current !== null;
        wrapRef.current!.style.cursor = overDraggable || overGroup ? "grab" : h ? "pointer" : "";
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        const gd = groupDrag.current;
        groupDrag.current = null;
        if (gd?.moved) {
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 100);
          wrapRef.current!.style.cursor = "";
          return;
        }
        if (!d || !d.moved) return;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 100);
        if (d.bounded) {
          // let go: it's already inside its free zone, so the sim leaves it roughly where you put it
          d.node.fx = d.node.fy = undefined;
          d.node.vx = d.node.vy = 0;
          wrapRef.current!.style.cursor = "";
          return;
        }
        const p = localPoint(e);
        const id = groupAt(p.x, p.y);
        const g = id === null ? undefined : groups.current.get(id);
        if (g && g.id !== d.node.user.groupId) {
          d.node.fx = d.node.fy = undefined;
          propsRef.current.onDropOnGroup(g);
        }
        // dropped in open space (or back home): it stays where you put it
        wrapRef.current!.style.cursor = "";
      }}
      onPointerLeave={() => {
        hoverGroup.current = null;
        if (!groupDrag.current?.moved) groupDrag.current = null;
      }}
    >
      {size.w > 0 && (
        <ForceGraph2D<NodeData, LinkData>
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data as never}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={NODE_R}
          nodeVisibility={(n) => isVisible(n as NodeData)}
          linkVisibility={(l) => {
            const s = (l as LinkData).source;
            const t = (l as LinkData).target;
            return typeof s === "object" && typeof t === "object" && isVisible(s) && isVisible(t);
          }}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(obj, color, ctx) => {
            const n = obj as NodeData;
            const pos = renderPos(n);
            const scale = isFocused(n) ? 1 : UNFOCUSED_SCALE;
            const radius = NODE_R * scale * (n.id === propsRef.current.meId ? 1.3 : 1) * 1.2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          // Lines aren't clickable. Otherwise force-graph treats a click on a line crossing a bubble as a
          // "link click" and the bubble's click (enter) and double-click (bookmark) never fire.
          linkPointerAreaPaint={() => {}}
          onRenderFramePre={onRenderFramePre}
          onRenderFramePost={onRenderFramePost}
          autoPauseRedraw={false}
          minZoom={0.15}
          maxZoom={6}
          enableNodeDrag={false}
          enableZoomInteraction={!inRoom}
          enablePanInteraction={false}
          showPointerCursor={false}
          // budgeted in ticks, not wall-clock time, so frames a hidden or throttled tab never drew don't use it up
          cooldownTime={Infinity}
          cooldownTicks={720}
          d3VelocityDecay={0.35}
          onNodeHover={(n) => {
            if (drag.current || groupDrag.current?.moved) return;
            hoverNode.current = (n as NodeData | null) ?? null;
          }}
          onNodeClick={(n) => {
            if (suppressClick.current) return;
            propsRef.current.onNodeClick((n as NodeData).user);
          }}
          onBackgroundClick={(e) => {
            if (suppressClick.current) return;
            const id = groupAt(e.offsetX, e.offsetY);
            if (inRoom) {
              if (id !== propsRef.current.roomGroupId) propsRef.current.onBackgroundClick();
              return;
            }
            const g = id === null ? undefined : groups.current.get(id);
            if (!g) return propsRef.current.onBackgroundClick();
            // single click enters; a second click within the window opens "Add to bookmark" instead
            const pending = pendingClick.current;
            if (pending && pending.groupId === g.id) {
              clearTimeout(pending.timer);
              pendingClick.current = null;
              propsRef.current.onGroupDoubleClick(g, { x: e.clientX, y: e.clientY });
              return;
            }
            if (pending) clearTimeout(pending.timer);
            pendingClick.current = {
              groupId: g.id,
              timer: setTimeout(() => {
                pendingClick.current = null;
                propsRef.current.onGroupClick(g);
              }, DOUBLE_CLICK_MS),
            };
          }}
        />
      )}
    </div>
  );
}
