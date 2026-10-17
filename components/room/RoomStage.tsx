"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hashString, initials, rgba } from "@/lib/colors";
import { INTERESTS } from "@/lib/interests";
import type { Edge, GraphUser } from "@/lib/types";

type Props = {
  members: GraphUser[];
  edges: Edge[];
  color: string;
  meId: string | null;
  selectedId: string | null;
  levels: React.RefObject<Map<string, number>>;
  onSelect: (user: GraphUser, screen: { x: number; y: number }) => void;
};

const MEMBER_R = 28;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function useViewport() {
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const resize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return vp;
}

/** The "virtual room": a glowing circle with members on a ring, friendship edges between them. */
export function RoomStage({ members, edges, color, meId, selectedId, levels, onSelect }: Props) {
  const { w, h } = useViewport();
  const cx = w / 2;
  const cy = h / 2 - 16;
  const R = Math.min(w, h) * 0.34;
  const shakeRefs = useRef(new Map<string, SVGGElement>());
  const ringRefs = useRef(new Map<string, SVGCircleElement>());

  const positions = useMemo(() => {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const n = sorted.length;
    const ring = n <= 1 ? 0 : R * (n === 2 ? 0.4 : 0.62);
    return new Map(
      sorted.map((m, i) => {
        const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
        return [m.id, { x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring, angle: a }];
      }),
    );
  }, [members, R, cx, cy]);

  const roomEdges = useMemo(() => {
    const ids = new Set(members.map((m) => m.id));
    return edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, key: pairKey(e.source, e.target) }));
  }, [members, edges]);

  // Trembling speakers: jitter scales with the live audio level; a soft ring breathes with it.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      for (const [id, el] of shakeRefs.current) {
        const level = levels.current?.get(id) ?? 0;
        const a = level > 0.01 && !reduced ? 1 + level * 5 : 0;
        el.setAttribute("transform", a ? `translate(${(Math.random() * 2 - 1) * a} ${(Math.random() * 2 - 1) * a})` : "");
        const ring = ringRefs.current.get(id);
        if (ring) {
          ring.setAttribute("r", String(MEMBER_R + 5 + level * 14));
          ring.setAttribute("opacity", String(level > 0.01 ? 0.35 + level * 0.65 : 0));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levels]);

  if (!w) return null;

  const outward = (id: string) => {
    const p = positions.get(id);
    const a = p ? p.angle : -Math.PI / 2;
    return { x: cx + Math.cos(a) * R * 1.55, y: cy + Math.sin(a) * R * 1.55 };
  };

  return (
    <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Room members">
      <defs>
        <radialGradient id="room-fill">
          <stop offset="0%" stopColor={rgba(color, 0.16)} />
          <stop offset="70%" stopColor={rgba(color, 0.06)} />
          <stop offset="100%" stopColor={rgba(color, 0.02)} />
        </radialGradient>
        <radialGradient id="member-shine" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <motion.circle
        cx={cx}
        cy={cy}
        initial={{ r: R * 0.6, opacity: 0 }}
        animate={{ r: R, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        fill="url(#room-fill)"
        stroke={rgba(color, 0.45)}
        strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 28px ${rgba(color, 0.55)})` }}
      />

      <AnimatePresence>
        {roomEdges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const vivid = selectedId !== null && (e.source === selectedId || e.target === selectedId);
          return (
            <motion.line
              key={e.key}
              initial={{ opacity: 0, x1: a.x, y1: a.y, x2: b.x, y2: b.y }}
              animate={{ opacity: vivid ? 0.95 : 0.35, x1: a.x, y1: a.y, x2: b.x, y2: b.y }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              stroke={vivid ? color : "rgb(160,180,255)"}
              strokeWidth={vivid ? 2 : 1}
              style={vivid ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
            />
          );
        })}
      </AnimatePresence>

      <AnimatePresence>
        {members.map((m) => {
          const p = positions.get(m.id) ?? { x: cx, y: cy };
          const out = outward(m.id);
          const mColor = INTERESTS.find((i) => i.id === m.interestIds[0])?.color ?? "#60A5FA";
          const delay = (hashString(m.id) % 4000) / 1000;
          return (
            <motion.g
              key={m.id}
              initial={{ x: out.x, y: out.y, opacity: 0 }}
              animate={{ x: p.x, y: p.y, opacity: 1 }}
              exit={{ x: out.x, y: out.y, opacity: 0, transition: { duration: 0.5, ease: [0.55, 0, 0.75, 0.3] } }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(m, { x: p.x, y: p.y });
              }}
            >
              <g style={{ animation: `bob 4.2s ease-in-out ${-delay}s infinite` }}>
                <g
                  ref={(el) => {
                    if (el) shakeRefs.current.set(m.id, el);
                    else shakeRefs.current.delete(m.id);
                  }}
                >
                  <circle
                    ref={(el) => {
                      if (el) ringRefs.current.set(m.id, el);
                      else ringRefs.current.delete(m.id);
                    }}
                    r={MEMBER_R + 5}
                    fill="none"
                    stroke={mColor}
                    strokeWidth={2}
                    opacity={0}
                    style={{ filter: `drop-shadow(0 0 8px ${mColor})` }}
                  />
                  <motion.g whileHover={{ scale: 1.12 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
                    <circle
                      r={MEMBER_R}
                      fill={mColor}
                      style={{ filter: `drop-shadow(0 0 ${selectedId === m.id ? 22 : 12}px ${mColor})` }}
                    />
                    {m.avatarUrl ? (
                      <>
                        <clipPath id={`clip-${m.id}`}>
                          <circle r={MEMBER_R - 2} />
                        </clipPath>
                        <image
                          href={m.avatarUrl}
                          x={-MEMBER_R}
                          y={-MEMBER_R}
                          width={MEMBER_R * 2}
                          height={MEMBER_R * 2}
                          clipPath={`url(#clip-${m.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </>
                    ) : (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={MEMBER_R * 0.62}
                        fontWeight={700}
                        fill="rgba(3,5,12,0.85)"
                      >
                        {initials(m.name)}
                      </text>
                    )}
                    <circle r={MEMBER_R} fill="url(#member-shine)" />
                    <circle r={MEMBER_R} fill="none" stroke="rgba(255,255,255,0.3)" />
                    {m.id === meId && <circle r={MEMBER_R + 3} fill="none" stroke="#fff" strokeWidth={1.5} />}
                  </motion.g>
                </g>
                <text
                  y={MEMBER_R + 18}
                  textAnchor="middle"
                  fontSize={12.5}
                  fill="rgba(230,236,255,0.9)"
                  style={{ paintOrder: "stroke", stroke: "rgba(3,5,12,0.6)", strokeWidth: 3 }}
                >
                  {m.id === meId ? `${m.name} (you)` : m.name}
                </text>
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
