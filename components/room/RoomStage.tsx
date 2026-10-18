"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hashString } from "@/lib/colors";
import type { GraphUser } from "@/lib/types";
import { RoomBubble, blobPath, type BubbleEls } from "./RoomBubble";
import { RoomFriendshipEdges, type DrawnEdge, type EdgeEls } from "./RoomFriendshipEdges";
import { RoomMember, type NodeEls, type StageMember } from "./RoomMember";
import { assignSeats, seatAt } from "./roomLayout";

type Props = {
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

/** The radial room: a softly tinted bubble, friendship lines, and people floating in stable seats. */
export function RoomStage({ members, friendsOf, color, meId, hoveredId, onHover, onSelect, getLevel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(wrapRef);
  const rendered = useWithLeaving(members);

  // ---- geometry ----
  const R = Math.max(60, Math.min(w, h) / 2 - 18);
  // Small stages (phone with chat open): smaller circles, names on hover/focus only, so nobody overlaps.
  const compact = R < 150;
  const nodeR = compact ? Math.max(10, Math.min(18, R * 0.14)) : Math.max(17, Math.min(30, R * 0.095));
  const usable = Math.max(0, R - nodeR - (compact ? 8 : 34)); // room for names under the outer ring
  const cx = w / 2;
  const cy = h / 2;

  const [seats] = useState(() => new Map<string, number>());
  const presentIds = members.map((m) => m.user.id).join(",");
  const seatMap = useMemo(
    () => new Map(assignSeats(seats, presentIds ? presentIds.split(",") : [], meId)),
    [seats, presentIds, meId],
  );

  const geometry = useMemo(() => {
    const targets = new Map<string, Pt>();
    const entries = new Map<string, Pt>();
    const exits = new Map<string, Pt>();
    for (const m of rendered) {
      const id = m.user.id;
      const seat = seatAt(seatMap.get(id) ?? 0);
      // the center seat has no direction of its own; send it out downward
      const angle = seat.x === 0 && seat.y === 0 ? Math.PI / 2 : Math.atan2(seat.y, seat.x);
      targets.set(id, { x: cx + seat.x * usable, y: cy + seat.y * usable });
      entries.set(id, { x: cx + Math.cos(angle) * (R - nodeR), y: cy + Math.sin(angle) * (R - nodeR) });
      exits.set(id, { x: cx + Math.cos(angle) * (R + nodeR * 2 + 40), y: cy + Math.sin(angle) * (R + nodeR * 2 + 40) });
    }
    return { targets, entries, exits };
  }, [rendered, seatMap, cx, cy, usable, R, nodeR]);

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

  const latest = useRef({ rendered, edges, geometry, R, cx, cy, nodeR, getLevel });
  useEffect(() => {
    latest.current = { rendered, edges, geometry, R, cx, cy, nodeR, getLevel };
  });

  // ---- one loop: ease toward seats, gentle float, speaking ripples, edges follow drawn positions ----
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = new Map<string, Pt>();
    const drawn = new Map<string, Pt>();
    const wasSpeaking = new Set<string>();
    const bubble = { r: 0, cx: 0, cy: 0 };
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const s = latest.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const ease = reduced ? 1 : 1 - Math.exp(-dt / 0.16);

      if (s.R && bubbleEls.current) {
        if (!bubble.r) Object.assign(bubble, { r: s.R * 0.72, cx: s.cx, cy: s.cy });
        const k = reduced ? 1 : 1 - Math.exp(-dt / 0.22);
        bubble.r += (s.R - bubble.r) * k;
        bubble.cx += (s.cx - bubble.cx) * k;
        bubble.cy += (s.cy - bubble.cy) * k;
        const d = blobPath(bubble.cx, bubble.cy, bubble.r, reduced ? 0 : t);
        const { outline, halo, glow, rings } = bubbleEls.current;
        outline.setAttribute("d", d);
        halo.setAttribute("d", d);
        glow.setAttribute("cx", String(bubble.cx));
        glow.setAttribute("cy", String(bubble.cy));
        glow.setAttribute("r", String(bubble.r * 1.3));
        rings.setAttribute("transform", `translate(${bubble.cx} ${bubble.cy}) scale(${bubble.r})`);
      }

      drawn.clear();
      for (const m of s.rendered) {
        const id = m.user.id;
        const el = nodeEls.current.get(id);
        const target = (m.leaving ? s.geometry.exits : s.geometry.targets).get(id);
        if (!el || !target) continue;
        let p = pos.get(id);
        if (!p) {
          p = { ...(s.geometry.entries.get(id) ?? target) };
          pos.set(id, p);
        }
        const k = m.leaving ? (reduced ? 1 : 1 - Math.exp(-dt / 0.2)) : ease;
        p.x += (target.x - p.x) * k;
        p.y += (target.y - p.y) * k;
        const phase = (hashString(id) % 628) / 100;
        const x = p.x + (reduced ? 0 : Math.sin(t * 0.55 + phase) * 1.5);
        const y = p.y + (reduced ? 0 : Math.cos(t * 0.45 + phase * 1.3) * 2.5);
        drawn.set(id, { x, y });
        el.root.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);

        // Speaking: driven by LiveKit's speaking flag (props) and live audio level (read here, not via React).
        if (m.speaking && m.mic !== "off") {
          const level = Math.min(1, 0.3 + s.getLevel(id) * 2.2);
          el.ring.setAttribute("r", String(s.nodeR + 7 + level * 4)); // outside the white "you" ring
          el.ring.setAttribute("opacity", String(0.55 + 0.45 * level));
          el.ripples.forEach((c, i) => {
            if (reduced) return c.setAttribute("opacity", "0");
            const ph = (t * 0.85 + i / 3) % 1;
            c.setAttribute("r", String(s.nodeR + 8 + ph * (8 + 16 * level)));
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
      for (const id of [...pos.keys()]) if (!s.rendered.some((m) => m.user.id === id)) pos.delete(id);

      // Edges end at the circles' rims, not their centers.
      const gap = s.nodeR + 4;
      for (const e of s.edges) {
        const els = edgeEls.current.get(e.key);
        const a = drawn.get(e.a);
        const b = drawn.get(e.b);
        if (!els || !a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < gap * 2) continue;
        const ux = dx / len;
        const uy = dy / len;
        const x1 = String(a.x + ux * gap);
        const y1 = String(a.y + uy * gap);
        const x2 = String(b.x - ux * gap);
        const y2 = String(b.y - uy * gap);
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

      raf = requestAnimationFrame(frame);
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
                r={nodeR}
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
