"use client";

import { forceCollide } from "d3-force";
import { polygonCentroid, polygonContains, polygonHull } from "d3-polygon";
import { curveCatmullRomClosed, line } from "d3-shape";
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { initials, rgba } from "@/lib/colors";
import { INTERESTS } from "@/lib/interests";
import { sceneEvents } from "@/lib/client/scene";
import type { Graph, GraphGroup, GraphUser } from "@/lib/types";
import { SlotAllocator, anchorForSlot, bob, outerRingRadius, ringPoint } from "./layout";

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
};
type LinkData = { key: string; source: string | NodeData; target: string | NodeData; bornAt: number };
type Camera = { x: number; y: number; k: number };
type Pt = [number, number];

export type MapApi = {
  zoomToGroup: (groupId: number, ms?: number) => void;
  fitAll: (ms?: number) => void;
  /** zoom in on someone's circle; false if they aren't in a group (alone in the outer ring, fitAll frames better) */
  centerOnUser: (userId: string, ms?: number) => boolean;
  getCamera: () => Camera;
  setCamera: (c: Camera, ms?: number) => void;
  /** fade everything except this group (entering a room) */
  focusGroup: (groupId: number | null) => void;
  pause: () => void;
  resume: () => void;
};

type Props = {
  graph: Graph;
  meId: string | null;
  friendIds: string[];
  selectedId: string | null;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onNodeClick: (user: GraphUser) => void;
  onGroupClick: (group: GraphGroup) => void;
  onBackgroundClick: () => void;
  onReady: (api: MapApi) => void;
};

const NODE_R = 7;
const BLOB_PAD = 26;
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
  const [slots] = useState(() => new SlotAllocator());
  const hulls = useRef(new Map<number, Pt[]>());
  const hoverNode = useRef<NodeData | null>(null);
  const hoverGroup = useRef<number | null>(null);
  const focus = useRef<{ groupId: number; start: number } | null>(null);
  const pulses = useRef(new Map<number, number>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const motionOK = useRef(true);
  const fonts = useRef({ sans: "sans-serif", heading: "sans-serif" });
  const frame = useRef({
    t: 0,
    highlight: null as Set<string> | null,
    vivid: null as Set<string> | null,
    ringed: null as Set<string> | null,
    fade: 0,
  });

  const targetFor = useCallback(
    (groupId: number | null, id: string) => {
      const slot = groupId === null ? undefined : slots.get(groupId);
      return slot === undefined ? ringPoint(id, outerRingRadius(slots.maxSlot)) : anchorForSlot(slot);
    },
    [slots],
  );

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

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    let anchored: NodeData[] = [];
    const anchor = Object.assign(
      (alpha: number) => {
        for (const n of anchored) {
          const t = targetFor(n.user.groupId, n.id);
          n.vx = (n.vx ?? 0) + (t.x - (n.x ?? 0)) * 0.08 * alpha;
          n.vy = (n.vy ?? 0) + (t.y - (n.y ?? 0)) * 0.08 * alpha;
        }
      },
      { initialize: (ns: NodeData[]) => (anchored = ns) },
    );
    fg.d3Force("center", null);
    fg.d3Force("charge")?.strength(-70).distanceMax(220);
    fg.d3Force("collide", forceCollide(17));
    fg.d3Force("link")
      ?.distance(60)
      .strength((l: LinkData) => {
        const s = l.source as NodeData;
        const t = l.target as NodeData;
        return s.user?.groupId !== null && s.user?.groupId === t.user?.groupId ? 0.08 : 0.015;
      });
    fg.d3Force("anchor", anchor as never);
    fg.d3ReheatSimulation();

    propsRef.current.onReady({
      zoomToGroup: (groupId, ms = 600) => {
        const members = [...nodes.values()].filter((n) => n.user.groupId === groupId);
        if (members.length) fg.zoomToFit(ms, 90, (n) => (n as NodeData).user.groupId === groupId);
        else {
          const slot = slots.get(groupId);
          const a = slot === undefined ? { x: 0, y: 0 } : anchorForSlot(slot);
          fg.centerAt(a.x, a.y, ms);
          fg.zoom(4, ms);
        }
      },
      fitAll: (ms = 600) => fg.zoomToFit(ms, 70, (n) => (n as NodeData).user.groupId !== null),
      centerOnUser: (userId, ms = 800) => {
        const n = nodes.get(userId);
        if (n?.user.groupId == null || n.x === undefined || n.y === undefined) return false;
        fg.centerAt(n.x, n.y, ms);
        fg.zoom(1.4, ms);
        return true;
      },
      getCamera: () => ({ ...fg.centerAt(), k: fg.zoom() }),
      setCamera: (c, ms = 800) => {
        fg.centerAt(c.x, c.y, ms);
        fg.zoom(c.k, ms);
      },
      focusGroup: (groupId) => (focus.current = groupId === null ? null : { groupId, start: performance.now() }),
      pause: () => fg.pauseAnimation(),
      resume: () => fg.resumeAnimation(),
    });
  }, [size.w, targetFor, nodes, slots]);

  // ---- sync server graph into persistent node/link objects (keeps positions across updates) ----
  useEffect(() => {
    const { graph } = props;
    const now = performance.now();
    const initial = nodes.size === 0;
    slots.sync(graph.groups.map((g) => g.id));
    groups.current = new Map(graph.groups.map((g) => [g.id, g]));

    let structural = false;
    let moved = false;
    const seen = new Set<string>();
    for (const u of graph.users) {
      seen.add(u.id);
      const color = INTEREST_COLOR.get(u.interestIds[0]) ?? "#60A5FA";
      const existing = nodes.get(u.id);
      if (!existing) {
        const t = targetFor(u.groupId, u.id);
        nodes.set(u.id, {
          id: u.id,
          user: u,
          color,
          phase: Math.random() * Math.PI * 2,
          bornAt: initial ? 0 : now,
          x: t.x + (Math.random() - 0.5) * 60,
          y: t.y + (Math.random() - 0.5) * 60,
        });
        structural = true;
      } else {
        if (existing.user.groupId !== u.groupId) moved = true;
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
  }, [props.graph, nodes, links, slots, targetFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderPos = (n: NodeData) => {
    const b = bob(n.phase, frame.current.t, motionOK.current);
    return { x: (n.x ?? 0) + b.dx, y: (n.y ?? 0) + b.dy };
  };

  // ---- per-frame: focus state + group blobs (drawn under links and nodes) ----
  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D, gs: number) => {
      const t = performance.now();
      const f = frame.current;
      f.t = t;
      const { meId, friendIds, selectedId } = propsRef.current;
      const friends = new Set(friendIds);
      const hover = hoverNode.current?.id ?? null;
      const nb = (id: string) => neighbors.current.get(id) ?? new Set<string>();

      f.highlight = f.vivid = f.ringed = null;
      if (hover) {
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
        if (n.user.groupId === null) continue;
        if (!byGroup.has(n.user.groupId)) byGroup.set(n.user.groupId, []);
        byGroup.get(n.user.groupId)!.push(n);
      }

      hulls.current = new Map();
      for (const g of groups.current.values()) {
        // Someone still gliding over from another group joins the blob once they arrive,
        // so the shape doesn't stretch across the map.
        const slot = slots.get(g.id);
        const home = slot === undefined ? null : anchorForSlot(slot);
        const all = byGroup.get(g.id) ?? [];
        const arrived = home ? all.filter((m) => Math.hypot((m.x ?? 0) - home.x, (m.y ?? 0) - home.y) < 150) : all;
        const members = arrived.length ? arrived : all;
        let pts: Pt[] = [];
        if (members.length) {
          for (const m of members) {
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              pts.push([(m.x ?? 0) + Math.cos(a) * BLOB_PAD, (m.y ?? 0) + Math.sin(a) * BLOB_PAD]);
            }
          }
        } else {
          const c = home ?? { x: 0, y: 0 };
          pts = Array.from({ length: 16 }, (_, i) => [c.x + Math.cos((i / 16) * Math.PI * 2) * 36, c.y + Math.sin((i / 16) * Math.PI * 2) * 36] as Pt);
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

        const hovered = hoverGroup.current === g.id && !hoverNode.current;
        const isFocus = fg?.groupId === g.id;
        const alpha = fg ? (isFocus ? 1 : 1 - f.fade) : 1;
        if (alpha <= 0.01) continue;
        const pulseAt = pulses.current.get(g.id);
        const pulse = pulseAt ? clamp01(1 - (t - pulseAt) / 1100) : 0;
        const fillBoost = hovered || isFocus ? 0.22 : 0.14;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        smoothPath.context(ctx)(hull);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgba(g.color, fillBoost + f.fade * (isFocus ? 0.1 : 0)));
        grad.addColorStop(1, rgba(g.color, 0.04));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowColor = g.color;
        ctx.shadowBlur = 30 + pulse * 30;
        ctx.lineWidth = (1.2 + pulse * 2.5) / Math.max(gs, 0.5);
        ctx.strokeStyle = rgba(g.color, 0.25 + (hovered ? 0.25 : 0) + pulse * 0.6);
        if (!members.length) ctx.setLineDash([4 / gs, 4 / gs]);
        ctx.stroke();
        ctx.restore();

        if (gs > 0.3) {
          ctx.save();
          ctx.globalAlpha = alpha * (hovered ? 1 : 0.7);
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.font = `600 ${14 / gs}px ${fonts.current.heading}`;
          ctx.fillStyle = "#e6ecff";
          ctx.shadowColor = g.color;
          ctx.shadowBlur = 12;
          ctx.fillText(g.name, cx, top - 6 / gs);
          ctx.shadowBlur = 0;
          ctx.font = `500 ${10.5 / gs}px ${fonts.current.sans}`;
          ctx.fillStyle = rgba(g.color, 0.9);
          const label = g.activeCount ? `${g.activeCount} here now` : "empty · fades after 30 days";
          ctx.fillText(label, cx, top - 6 / gs - 16 / gs);
          ctx.restore();
        }
      }
    },
    [nodes, slots],
  );

  const nodeCanvasObject = useCallback((obj: NodeObject<NodeData>, ctx: CanvasRenderingContext2D, gs: number) => {
    const n = obj as NodeData;
    const f = frame.current;
    const { meId, selectedId } = propsRef.current;
    const { x, y } = renderPos(n);
    const hovered = hoverNode.current?.id === n.id;
    const selected = selectedId === n.id;

    let alpha = 1;
    if (f.highlight && !f.highlight.has(n.id)) alpha = 0.35;
    if (n.user.away) alpha *= 0.45;
    if (focus.current && n.user.groupId !== focus.current.groupId) alpha *= 1 - f.fade;
    if (alpha <= 0.01) return;

    const born = n.bornAt ? clamp01((f.t - n.bornAt) / 650) : 1;
    const r = NODE_R * (hovered || selected ? 1.25 : 1) * Math.max(0, easeOutBack(born));

    ctx.save();
    ctx.globalAlpha = alpha;

    if (born < 1) {
      // glow burst for a brand-new circle
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * (1 + born * 3), 0, Math.PI * 2);
      ctx.fillStyle = rgba(n.color, 0.35 * (1 - born));
      ctx.fill();
    }

    if (!n.user.away) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = hovered || selected ? 28 : 14;
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
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.stroke();

    const img = n.user.avatarUrl ? images.current.get(n.user.avatarUrl) : undefined;
    if (n.user.avatarUrl && !img) {
      const el = new Image();
      el.src = n.user.avatarUrl;
      images.current.set(n.user.avatarUrl, el);
    }
    if (gs > 4 && img?.complete && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else if (gs > 2.5) {
      ctx.font = `700 ${r * 0.8}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(3,5,12,0.85)";
      ctx.fillText(initials(n.user.name), x, y + r * 0.05);
    }

    if (n.id === meId) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 1.6 / gs;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
    if (f.ringed?.has(n.id)) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / gs, 0, Math.PI * 2);
      ctx.lineWidth = 1.2 / gs;
      ctx.strokeStyle = rgba(n.color, 0.7);
      ctx.stroke();
    }

    if (hovered || selected || n.id === meId || gs > 1.8) {
      ctx.font = `500 ${11 / gs}px ${fonts.current.sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(230,236,255,0.88)";
      const label = n.id === meId ? `${n.user.name} (you)` : n.user.name;
      ctx.fillText(label, x, y + r + 4 / gs);
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

    let alpha = f.highlight ? (vivid ? 0.95 : 0.05) : 0.2;
    if (s.user.away || e.user.away) alpha *= 0.6;
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
      ctx.lineWidth = Math.max(1.6, 1.6 / gs);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = "rgb(160,180,255)";
      ctx.lineWidth = Math.max(0.6, 0.7 / gs);
    }
    ctx.stroke();
    ctx.restore();
  }, []);  

  // Keep the profile card glued to its (bobbing, panning) node.
  const onRenderFramePost = useCallback(() => {
    const { selectedId, cardRef } = propsRef.current;
    const card = cardRef.current;
    const fg = fgRef.current;
    if (!selectedId || !card || !fg) return;
    const n = nodes.get(selectedId);
    if (!n) return;
    const pos = renderPos(n);
    const p = fg.graph2ScreenCoords(pos.x, pos.y);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let x = p.x + 26;
    if (x + w > window.innerWidth - 12) x = p.x - 26 - w;
    const y = Math.max(72, Math.min(p.y - h / 2, window.innerHeight - h - 12));
    card.style.transform = `translate3d(${Math.max(12, x)}px, ${y}px, 0)`;
  }, [nodes]);  

  const groupAt = (sx: number, sy: number) => {
    const fg = fgRef.current;
    if (!fg) return null;
    const { x, y } = fg.screen2GraphCoords(sx, sy);
    for (const [id, hull] of hulls.current) if (polygonContains(hull, [x, y])) return id;
    return null;
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      onMouseMove={(e) => {
        const rect = wrapRef.current!.getBoundingClientRect();
        hoverGroup.current = groupAt(e.clientX - rect.left, e.clientY - rect.top);
        wrapRef.current!.style.cursor = hoverNode.current || hoverGroup.current !== null ? "pointer" : "";
      }}
      onMouseLeave={() => (hoverGroup.current = null)}
    >
      {size.w > 0 && (
        <ForceGraph2D<NodeData, LinkData>
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data as never}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={NODE_R}
          nodeCanvasObject={nodeCanvasObject}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => "replace"}
          onRenderFramePre={onRenderFramePre}
          onRenderFramePost={onRenderFramePost}
          autoPauseRedraw={false}
          minZoom={0.3}
          maxZoom={8}
          enableNodeDrag={false}
          showPointerCursor={false}
          cooldownTime={12000}
          d3VelocityDecay={0.35}
          onNodeHover={(n) => {
            hoverNode.current = (n as NodeData | null) ?? null;
            if (wrapRef.current) wrapRef.current.style.cursor = n || hoverGroup.current !== null ? "pointer" : "";
          }}
          onNodeClick={(n) => propsRef.current.onNodeClick((n as NodeData).user)}
          onBackgroundClick={(e) => {
            const id = groupAt(e.offsetX, e.offsetY);
            const g = id === null ? undefined : groups.current.get(id);
            if (g) propsRef.current.onGroupClick(g);
            else propsRef.current.onBackgroundClick();
          }}
        />
      )}
    </div>
  );
}
