"use client";

import { forceCollide } from "d3-force";
import { polygonCentroid, polygonContains, polygonHull } from "d3-polygon";
import { curveCatmullRomClosed, line } from "d3-shape";
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { initials, rgba } from "@/lib/colors";
import { INTERESTS } from "@/lib/interests";
import { scene, sceneEvents } from "@/lib/client/scene";
import type { Graph, GraphGroup, GraphUser } from "@/lib/types";
import { bob, computeLayout, ringPoint, type Layout } from "./layout";

type NodeData = {
  id: string;
  user: GraphUser;
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

export type MapApi = {
  zoomToGroup: (groupId: number, ms?: number) => void;
  /** fit the focused bubbles (your bubble ends up near the center) */
  fitFocused: (ms?: number) => void;
  getCamera: () => Camera;
  /** fade everything except this group (entering a room) */
  focusGroup: (groupId: number | null) => void;
  /** room scroll-out scrub: 0 = room zoom, 1 = about to exit */
  scrub: (progress: number) => void;
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

const NODE_R = 14;
const UNFOCUSED_SCALE = 0.55;
const BLOB_PAD = 40;
const ARRIVED = 230; // members farther than this from their anchor are still travelling
const DOUBLE_CLICK_MS = 260;
const INTEREST_COLOR = new Map(INTERESTS.map((i) => [i.id, i.color]));
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
const smoothPath = line<Pt>().curve(curveCatmullRomClosed.alpha(0.6));

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
  const hoverNode = useRef<NodeData | null>(null);
  const hoverGroup = useRef<number | null>(null);
  const focus = useRef<{ groupId: number; start: number } | null>(null);
  const pulses = useRef(new Map<number, number>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const drag = useRef<{ node: NodeData; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const pendingClick = useRef<{ groupId: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const scrubBase = useRef<number | null>(null);
  const motionOK = useRef(true);
  const fonts = useRef({ sans: "sans-serif", heading: "sans-serif" });
  const frame = useRef({
    t: 0,
    light: false,
    highlight: null as Set<string> | null,
    vivid: null as Set<string> | null,
    ringed: null as Set<string> | null,
    fade: 0,
  });

  const isVisible = (n: NodeData) => {
    const v = propsRef.current.visibleUserIds;
    return !v || v.has(n.id);
  };
  const isFocused = (n: NodeData) => n.user.groupId === null || propsRef.current.focusedGroupIds.has(n.user.groupId);

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
      forceCollide<NodeData>((n) => (isFocused(n) ? 30 : 30 * UNFOCUSED_SCALE)) as never,
    );
  }, []);  

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    let anchored: NodeData[] = [];
    const anchor = Object.assign(
      (alpha: number) => {
        for (const n of anchored) {
          if (n.fx !== undefined) continue;
          const t = targetFor(n);
          n.vx = (n.vx ?? 0) + (t.x - (n.x ?? 0)) * 0.08 * alpha;
          n.vy = (n.vy ?? 0) + (t.y - (n.y ?? 0)) * 0.08 * alpha;
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
        const padY = 190; // room for the filter bar on top and the degrees slider below
        const w = Math.max(box.x[1] - box.x[0], 1);
        const h = Math.max(box.y[1] - box.y[0], 1);
        const k = Math.min(1.6, Math.max(0.15, Math.min((size.w - padX * 2) / w, (size.h - padY * 2) / h)));
        fg.centerAt((box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2 + 10 / k, ms);
        fg.zoom(k, ms);
      },
      getCamera: () => ({ ...fg.centerAt(), k: fg.zoom() }),
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
    });
  }, [size.w, size.h, targetFor, nodes, applyCollide]);  

  // ---- layout: focused bubbles in the middle (mine at the center), the rest in a side strip ----
  const focusKey = [...props.focusedGroupIds].sort((a, b) => a - b).join(",");
  const groupKey = props.graph.groups.map((g) => g.id).join(",");
  useEffect(() => {
    const ids = props.graph.groups.map((g) => g.id);
    const focused = ids.filter((id) => props.focusedGroupIds.has(id));
    const unfocused = ids.filter((id) => !props.focusedGroupIds.has(id));
    layout.current = computeLayout(focused, unfocused, props.myGroupId);
    applyCollide();
    fgRef.current?.d3ReheatSimulation();
  }, [focusKey, groupKey, props.myGroupId, props.meId, applyCollide]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const color = INTEREST_COLOR.get(u.interestIds[0]) ?? "#60A5FA";
      const existing = nodes.get(u.id);
      if (!existing) {
        const node: NodeData = { id: u.id, user: u, color, phase: Math.random() * Math.PI * 2, bornAt: initial ? 0 : now };
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
        existing.color = color;
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
    const b = bob(n.phase, frame.current.t, motionOK.current && drag.current?.node !== n);
    return { x: (n.x ?? 0) + b.dx, y: (n.y ?? 0) + b.dy };
  };

  // ---- per-frame: focus state + group blobs (drawn under links and nodes) ----
  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D, gs: number) => {
      const t = performance.now();
      const f = frame.current;
      f.t = t;
      f.light = document.documentElement.classList.contains("light");
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

      const byGroup = new Map<number, NodeData[]>();
      for (const n of nodes.values()) {
        if (n.user.groupId === null || !isVisible(n) || drag.current?.node === n) continue;
        if (!byGroup.has(n.user.groupId)) byGroup.set(n.user.groupId, []);
        byGroup.get(n.user.groupId)!.push(n);
      }

      hulls.current = new Map();
      for (const g of groups.current.values()) {
        const focusedGroup = propsRef.current.focusedGroupIds.has(g.id);
        const scale = focusedGroup ? 1 : UNFOCUSED_SCALE;
        const pad = BLOB_PAD * scale;
        // Someone still travelling over from elsewhere joins the blob once they arrive.
        const home = layout.current.anchors.get(g.id) ?? null;
        const all = byGroup.get(g.id) ?? [];
        const arrived = home ? all.filter((m) => Math.hypot((m.x ?? 0) - home.x, (m.y ?? 0) - home.y) < ARRIVED) : all;
        const members = arrived.length ? arrived : all;
        let pts: Pt[] = [];
        if (members.length) {
          for (const m of members) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              pts.push([(m.x ?? 0) + Math.cos(a) * pad, (m.y ?? 0) + Math.sin(a) * pad]);
            }
          }
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
        const alpha = (fg ? (isFocus ? 1 : 1 - f.fade) : 1) * (focusedGroup ? 1 : 0.55);
        if (alpha <= 0.01) continue;
        const pulseAt = pulses.current.get(g.id);
        const pulse = pulseAt ? clamp01(1 - (t - pulseAt) / 1100) : 0;
        const fillBoost = (hovered || isFocus ? 0.22 : 0.14) + (f.light ? 0.06 : 0);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        smoothPath.context(ctx)(hull);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgba(g.color, focusedGroup ? fillBoost + f.fade * (isFocus ? 0.08 : 0) : 0.08));
        grad.addColorStop(1, rgba(g.color, focusedGroup ? 0.05 : 0.03));
        ctx.fillStyle = grad;
        ctx.fill();
        if (focusedGroup) {
          ctx.shadowColor = g.color;
          ctx.shadowBlur = (isFocus ? 50 : 30) + pulse * 30;
        }
        ctx.lineWidth = (focusedGroup ? 1.6 + pulse * 2.5 : 1) / Math.max(gs, 0.5);
        ctx.strokeStyle = rgba(g.color, (focusedGroup ? 0.35 : 0.22) + (hovered ? 0.25 : 0) + pulse * 0.6 + (isFocus ? 0.3 : 0));
        if (!members.length) ctx.setLineDash([6 / gs, 6 / gs]);
        ctx.stroke();
        ctx.restore();

        if (gs > 0.18 && !(roomGroupId === g.id)) {
          ctx.save();
          ctx.globalAlpha = alpha * (hovered ? 1 : 0.75);
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.font = `600 ${(focusedGroup ? 15 : 12) / gs}px ${fonts.current.heading}`;
          ctx.fillStyle = f.light ? "#0b1230" : "#e6ecff";
          if (focusedGroup && !f.light) {
            ctx.shadowColor = g.color;
            ctx.shadowBlur = 12;
          }
          ctx.fillText(g.name, cx, top - 6 / gs);
          ctx.shadowBlur = 0;
          if (focusedGroup) {
            ctx.font = `500 ${10.5 / gs}px ${fonts.current.sans}`;
            ctx.fillStyle = f.light ? rgba(g.color, 1) : rgba(g.color, 0.9);
            const here = g.activeCount ? `${g.activeCount} here now` : "empty · fading in 24h";
            ctx.fillText(`${g.category} · ${here}`, cx, top - 6 / gs - 17 / gs);
          }
          ctx.restore();
        }
      }
    },
    [nodes],  
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
    const base = NODE_R * (focused ? 1 : UNFOCUSED_SCALE);
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

    if (!n.user.away && focused) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = (hovered || selected ? 30 : 16) * (f.light ? 0.6 : 1);
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
    shine.addColorStop(0, "rgba(255,255,255,0.55)");
    shine.addColorStop(0.65, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.lineWidth = 1 / gs;
    ctx.strokeStyle = f.light ? "rgba(11,18,48,0.25)" : "rgba(255,255,255,0.3)";
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
      ctx.font = `700 ${r * 0.8}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(3,5,12,0.85)";
      ctx.fillText(initials(n.user.name), x, y + r * 0.05);
    }

    if (n.id === meId) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 2 / gs;
      ctx.strokeStyle = f.light ? "#0b1230" : "#ffffff";
      ctx.stroke();
    }
    if (f.ringed?.has(n.id)) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 1.4 / gs;
      ctx.strokeStyle = rgba(n.color, 0.75);
      ctx.stroke();
    }

    if (focused && (hovered || selected || n.id === meId || gs > 1.1)) {
      ctx.font = `500 ${11.5 / gs}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = f.light ? "rgba(11,18,48,0.85)" : "rgba(230,236,255,0.9)";
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

    let alpha = f.highlight ? (vivid ? 0.95 : 0.05) : f.light ? 0.3 : 0.2;
    if (s.user.away || e.user.away) alpha *= 0.6;
    if (!isFocused(s) || !isFocused(e)) alpha *= 0.5;
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
      ctx.lineWidth = Math.max(2.4, 1.8 / gs);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = f.light ? 4 : 10;
    } else {
      ctx.strokeStyle = f.light ? "rgb(60,80,150)" : "rgb(160,180,255)";
      ctx.lineWidth = Math.max(1, 0.8 / gs);
    }
    ctx.stroke();
    ctx.restore();
  }, []);  

  const onRenderFramePost = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const { selectedId, cardRef, roomGroupId } = propsRef.current;

    // In a room the camera gently follows the bubble (it may still be settling into the center).
    if (roomGroupId !== null && scrubBase.current === null) {
      const members = [...nodes.values()].filter((n) => n.user.groupId === roomGroupId && isVisible(n));
      if (members.length) {
        const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length;
        const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length;
        const c = fg.centerAt();
        const dx = cx - c.x;
        const dy = cy - c.y;
        if (Math.hypot(dx, dy) > 0.5) fg.centerAt(c.x + dx * 0.06, c.y + dy * 0.06);
      }
    }

    // Keep the profile card glued to its (bobbing, panning) node.
    const card = cardRef.current;
    if (!selectedId || !card) return;
    const n = nodes.get(selectedId);
    if (!n) return;
    const pos = renderPos(n);
    const p = fg.graph2ScreenCoords(pos.x, pos.y);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let x = p.x + 34;
    if (x + w > window.innerWidth - 12) x = p.x - 34 - w;
    const y = Math.max(120, Math.min(p.y - h / 2, window.innerHeight - h - 12));
    card.style.transform = `translate3d(${Math.max(12, x)}px, ${y}px, 0)`;
  }, [nodes]);  

  const groupAt = (sx: number, sy: number) => {
    const fg = fgRef.current;
    if (!fg) return null;
    const { x, y } = fg.screen2GraphCoords(sx, sy);
    for (const [id, hull] of hulls.current) if (polygonContains(hull, [x, y])) return id;
    return null;
  };

  const localPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const inRoom = props.roomGroupId !== null;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      // Your own circle can be dragged: drop it in another bubble to join, or anywhere to park it.
      onPointerDownCapture={(e) => {
        const n = hoverNode.current;
        if (inRoom || !n || n.id !== propsRef.current.meId || e.button !== 0) return;
        drag.current = { node: n, startX: e.clientX, startY: e.clientY, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const fg = fgRef.current;
        if (d && fg) {
          if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
          if (d.moved) {
            const p = localPoint(e);
            const g = fg.screen2GraphCoords(p.x, p.y);
            d.node.fx = d.node.x = g.x;
            d.node.fy = d.node.y = g.y;
            hoverGroup.current = groupAt(p.x, p.y);
            wrapRef.current!.style.cursor = "grabbing";
          }
          return;
        }
        const p = localPoint(e);
        hoverGroup.current = inRoom ? null : groupAt(p.x, p.y);
        const overMe = hoverNode.current?.id === propsRef.current.meId && !inRoom;
        wrapRef.current!.style.cursor = overMe ? "grab" : hoverNode.current || hoverGroup.current !== null ? "pointer" : "";
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || !d.moved) return;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
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
      onPointerLeave={() => (hoverGroup.current = null)}
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
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          onRenderFramePre={onRenderFramePre}
          onRenderFramePost={onRenderFramePost}
          autoPauseRedraw={false}
          minZoom={0.15}
          maxZoom={6}
          enableNodeDrag={false}
          enableZoomInteraction={!inRoom}
          enablePanInteraction={() => !inRoom && !(hoverNode.current && hoverNode.current.id === propsRef.current.meId)}
          showPointerCursor={false}
          cooldownTime={12000}
          d3VelocityDecay={0.35}
          onNodeHover={(n) => {
            if (drag.current) return;
            hoverNode.current = (n as NodeData | null) ?? null;
          }}
          onNodeClick={(n) => {
            if (suppressClick.current) return;
            propsRef.current.onNodeClick((n as NodeData).user);
          }}
          onBackgroundClick={(e) => {
            if (suppressClick.current) return;
            const id = inRoom ? null : groupAt(e.offsetX, e.offsetY);
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
