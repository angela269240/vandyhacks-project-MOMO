"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scene } from "@/lib/client/scene";
import type { GraphUser } from "@/lib/types";
import { RoomBubble, type BubbleEls } from "./RoomBubble";
import { RoomFriendshipEdges, type DrawnEdge, type EdgeEls } from "./RoomFriendshipEdges";
import { RoomMember, type NodeEls, type StageMember } from "./RoomMember";
import { stageCircle } from "./roomLayout";

type Props = {
  /** the map bubble this room is a zoom into */
  groupId: number | null;
  members: StageMember[];
  /** accepted friendships across the graph: id -> friend ids */
  friendsOf: Map<string, Set<string>>;
  color: string;
  meId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (user: GraphUser, rect: DOMRect) => void;
  getLevel: (id: string) => number;
};

const LEAVE_MS = 550;
type Rendered = StageMember & { leaving: boolean };
type Pt = { x: number; y: number };

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Keeps people who just left on stage long enough to animate out (radially, past the bubble edge).
 * Uses the "adjust state while rendering" pattern rather than an effect.
 */
function useWithLeaving(members: StageMember[]) {
  const [prev, setPrev] = useState(members);
  const [leaving, setLeaving] = useState<Map<string, StageMember>>(new Map());
  if (members !== prev) {
    // `members` is rebuilt whenever anyone's speaking/mic state changes; only touch `leaving` when
    // membership itself changes, or its removal timer would keep restarting.
    const ids = new Set(members.map((m) => m.user.id));
    const next = new Map(leaving);
    let changed = false;
    for (const id of leaving.keys()) if (ids.has(id)) changed = next.delete(id) || changed; // came back
    for (const m of prev) {
      if (ids.has(m.user.id) || next.has(m.user.id)) continue;
      next.set(m.user.id, m);
      changed = true;
    }
    setPrev(members);
    if (changed) setLeaving(next);
  }
  useEffect(() => {
    if (!leaving.size) return;
    const gone = new Set(leaving.keys());
    const timer = setTimeout(() => setLeaving((cur) => new Map([...cur].filter(([id]) => !gone.has(id)))), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return useMemo<Rendered[]>(
    () => [
      ...members.map((m) => ({ ...m, leaving: false })),
      ...[...leaving.values()].map((m) => ({ ...m, leaving: true, speaking: false })),
    ],
    [members, leaving],
  );
}

/** A circle as an SVG path, so it can share the outline/halo paths with the bubble's other layers. */
const circlePath = (cx: number, cy: number, r: number) =>
  `M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} a ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0 a ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0 Z`;

/**
 * The room is a true zoom into its map bubble: the map's camera is framed so the bubble fills this stage, and
 * every person, line and the bubble itself are drawn exactly where (and as big as) the map draws them right
 * now. Nothing is re-seated or re-laid-out, so zooming in or out lines circles up with circles and lines with lines.
 */
export function RoomStage({ groupId, members, friendsOf, color, meId, hoveredId, onHover, onSelect, getLevel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(wrapRef);
  const rendered = useWithLeaving(members);

  // ---- geometry: frame the map so the bubble fills this stage ----
  const circle = stageCircle(w, h);
  // Small stages (phone with chat open): names on hover/focus only, so nobody overlaps.
  const compact = circle.r < 150;
  /** on-screen radius of an ordinary node at the map's current zoom (updated from the map each frame) */
  const [nodeR, setNodeR] = useState(24);
  /** each person's size relative to nodeR, as the map draws them (you 1.3, others by friendship distance) */
  const [sizeOf, setSizeOf] = useState<Map<string, number>>(() => new Map());
  const framed = useRef(false);
  const headCount = members.length;
  useEffect(() => {
    const el = wrapRef.current;
    if (groupId === null || !el || !w) return;
    const rect = el.getBoundingClientRect();
    const c = stageCircle(w, h);
    // the first frame continues the zoom in from the map; later ones (chat opening, someone joining) are quick
    scene.mapApi?.frameGroup(groupId, { x: rect.left + c.x, y: rect.top + c.y, r: c.r }, framed.current ? 350 : 450);
    framed.current = true;
  }, [groupId, w, h, headCount]);

  // ---- edges: accepted friendships between people on stage; fade when one end is leaving ----
  const related = useMemo(() => {
    if (!hoveredId) return null;
    return new Set([hoveredId, ...(friendsOf.get(hoveredId) ?? [])]);
  }, [hoveredId, friendsOf]);

  const edges = useMemo<DrawnEdge[]>(() => {
    const byId = new Map(rendered.map((m) => [m.user.id, m]));
    const out: DrawnEdge[] = [];
    for (const a of rendered) {
      for (const bId of friendsOf.get(a.user.id) ?? []) {
        const b = byId.get(bId);
        if (!b || a.user.id >= bId) continue;
        const touchesHover = hoveredId !== null && (a.user.id === hoveredId || bId === hoveredId);
        out.push({
          key: `${a.user.id}|${bId}`,
          a: a.user.id,
          b: bId,
          colorA: a.color,
          colorB: b.color,
          fading: a.leaving || b.leaving,
          emphasis: hoveredId ? (touchesHover ? "highlight" : "dim") : a.isMe || b.isMe ? "mine" : "normal",
        });
      }
    }
    return out;
  }, [rendered, friendsOf, hoveredId]);

  // ---- element registry for the animation loop ----
  const nodeEls = useRef(new Map<string, NodeEls>());
  const edgeEls = useRef(new Map<string, EdgeEls>());
  const bubbleEls = useRef<BubbleEls | null>(null);
  const registerNode = useCallback((id: string, els: NodeEls | null) => {
    if (els) nodeEls.current.set(id, els);
    else nodeEls.current.delete(id);
  }, []);
  const registerEdge = useCallback((key: string, els: EdgeEls | null) => {
    if (els) edgeEls.current.set(key, els);
    else edgeEls.current.delete(key);
  }, []);
  const registerBubble = useCallback((els: BubbleEls | null) => (bubbleEls.current = els), []);

  const latest = useRef({ groupId, rendered, edges, meId, getLevel });
  useEffect(() => {
    latest.current = { groupId, rendered, edges, meId, getLevel };
  });

  // ---- one loop: copy the map's positions, speaking ripples, edges follow drawn positions ----
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = new Map<string, Pt>();
    const radius = new Map<string, number>();
    const wasSpeaking = new Set<string>();
    let lastNodeR = 0;
    const sizes = new Map<string, number>();
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = latest.current;
      const api = scene.mapApi;
      const wrap = wrapRef.current;
      if (!api || !wrap || s.groupId === null) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const rect = wrap.getBoundingClientRect();
      const snap = api.roomSnapshot(s.groupId, s.rendered.map((m) => m.user.id));

      // The map's unit circle size at this zoom, read off your own circle (drawn 1.3x); signed out, everyone is 1x.
      // Everyone else is sized relative to it the way the map sizes them, so circles line up with circles.
      const mine = s.meId ? snap.people.get(s.meId) : undefined;
      const ordinary = mine ? mine.r / 1.3 : (snap.people.values().next().value?.r ?? 0);
      if (ordinary && Math.abs(ordinary - lastNodeR) > 0.5) {
        lastNodeR = ordinary;
        setNodeR(ordinary);
      }
      const nodeRadius = lastNodeR || 24;
      if (ordinary) {
        let changed = false;
        for (const [id, p] of snap.people) {
          const f = Math.round((p.r / ordinary) * 100) / 100;
          if (sizes.get(id) !== f) {
            sizes.set(id, f);
            changed = true;
          }
        }
        if (changed) setSizeOf(new Map(sizes));
      }

      const b = snap.bubble;
      const center = b ? { x: b.x - rect.left, y: b.y - rect.top } : { x: rect.width / 2, y: rect.height / 2 };
      const bubbleR = b?.r ?? Math.min(rect.width, rect.height) / 2;
      if (bubbleEls.current) {
        const d = circlePath(center.x, center.y, bubbleR);
        const { outline, halo, glow, rings } = bubbleEls.current;
        outline.setAttribute("d", d);
        halo.setAttribute("d", d);
        glow.setAttribute("cx", String(center.x));
        glow.setAttribute("cy", String(center.y));
        glow.setAttribute("r", String(bubbleR * 1.3));
        rings.setAttribute("transform", `translate(${center.x} ${center.y}) scale(${bubbleR})`);
      }

      for (const m of s.rendered) {
        const id = m.user.id;
        const el = nodeEls.current.get(id);
        if (!el) continue;
        const onMap = snap.people.get(id);
        let p = pos.get(id);
        if (m.leaving) {
          // slide straight out past the bubble's edge from wherever they were
          const from = p ?? (onMap ? { x: onMap.x - rect.left, y: onMap.y - rect.top } : center);
          const angle = Math.atan2(from.y - center.y, from.x - center.x) || Math.PI / 2;
          const out = bubbleR + nodeRadius * 2 + 40;
          const target = { x: center.x + Math.cos(angle) * out, y: center.y + Math.sin(angle) * out };
          const k = reduced ? 1 : 1 - Math.exp(-dt / 0.2);
          p = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k };
        } else if (onMap) {
          p = { x: onMap.x - rect.left, y: onMap.y - rect.top };
        } else {
          // not on the map yet (just joined): wait in the middle of the bubble
          const from = p ?? center;
          const k = reduced ? 1 : 1 - Math.exp(-dt / 0.16);
          p = { x: from.x + (center.x - from.x) * k, y: from.y + (center.y - from.y) * k };
        }
        pos.set(id, p);
        const r = onMap?.r ?? (m.isMe ? nodeRadius * 1.3 : nodeRadius);
        radius.set(id, r);
        el.root.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);

        // Speaking: driven by LiveKit's speaking flag (props) and live audio level (read here, not via React).
        if (m.speaking && m.mic !== "off") {
          const level = Math.min(1, 0.3 + s.getLevel(id) * 2.2);
          el.ring.setAttribute("r", String(r + 7 + level * 4)); // outside the white "you" ring
          el.ring.setAttribute("opacity", String(0.55 + 0.45 * level));
          el.ripples.forEach((c, i) => {
            if (reduced) return c.setAttribute("opacity", "0");
            const ph = (t * 0.85 + i / 3) % 1;
            c.setAttribute("r", String(r + 8 + ph * (8 + 16 * level)));
            c.setAttribute("opacity", String((1 - ph) * 0.5 * level));
          });
          const a = reduced ? 0 : level * 0.7;
          el.tremble.setAttribute("transform", a ? `translate(${(Math.random() * 2 - 1) * a} ${(Math.random() * 2 - 1) * a})` : "");
          wasSpeaking.add(id);
        } else if (wasSpeaking.has(id)) {
          el.ring.setAttribute("opacity", "0");
          el.ripples.forEach((c) => c.setAttribute("opacity", "0"));
          el.tremble.removeAttribute("transform");
          wasSpeaking.delete(id);
        }
      }
      for (const id of [...pos.keys()]) {
        if (s.rendered.some((m) => m.user.id === id)) continue;
        pos.delete(id);
        radius.delete(id);
      }

      // Edges end at the circles' rims, not their centers.
      for (const e of s.edges) {
        const els = edgeEls.current.get(e.key);
        const a = pos.get(e.a);
        const c = pos.get(e.b);
        if (!els || !a || !c) continue;
        const ga = (radius.get(e.a) ?? nodeRadius) + 2;
        const gc = (radius.get(e.b) ?? nodeRadius) + 2;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < ga + gc) continue;
        const ux = dx / len;
        const uy = dy / len;
        const x1 = String(a.x + ux * ga);
        const y1 = String(a.y + uy * ga);
        const x2 = String(c.x - ux * gc);
        const y2 = String(c.y - uy * gc);
        for (const line of [els.line, els.glow]) {
          line.setAttribute("x1", x1);
          line.setAttribute("y1", y1);
          line.setAttribute("x2", x2);
          line.setAttribute("y2", y2);
        }
        els.grad.setAttribute("x1", x1);
        els.grad.setAttribute("y1", y1);
        els.grad.setAttribute("x2", x2);
        els.grad.setAttribute("y2", y2);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const focusOf = (id: string): "normal" | "hovered" | "related" | "dim" =>
    !related ? "normal" : id === hoveredId ? "hovered" : related.has(id) ? "related" : "dim";

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {w > 0 && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-label="People in this room" role="group">
          {/* layers, bottom to top: bubble, friendship lines, people */}
          <RoomBubble color={color} register={registerBubble} />
          <RoomFriendshipEdges edges={edges} register={registerEdge} />
          <g>
            {rendered.map((m) => (
              <RoomMember
                key={m.user.id}
                m={m}
                r={nodeR * (sizeOf.get(m.user.id) ?? (m.isMe ? 1.3 : 1))}
                compact={compact}
                leaving={m.leaving}
                focus={focusOf(m.user.id)}
                register={registerNode}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
