import { MicOff, MonitorUp } from "lucide-react";
import { memo } from "react";
import { initials, rgba } from "@/lib/colors";
import type { GraphUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export type NodeEls = { root: SVGGElement; tremble: SVGGElement; ring: SVGCircleElement; ripples: SVGCircleElement[] };

export type StageMember = {
  user: GraphUser;
  color: string;
  isMe: boolean;
  /** an accepted friend of yours */
  isFriend: boolean;
  /** "none" = not connected to voice (different from muted) */
  mic: "on" | "off" | "none";
  speaking: boolean;
  sharing: boolean;
};

type Props = {
  m: StageMember;
  r: number;
  /** small stage: hide name labels unless hovered/focused */
  compact: boolean;
  leaving: boolean;
  focus: "normal" | "hovered" | "related" | "dim";
  register: (id: string, els: NodeEls | null) => void;
  onHover: (id: string | null) => void;
  onSelect: (user: GraphUser, rect: DOMRect) => void;
};

/**
 * One person in the room. Position, float, speaking rings and tremble are driven by the room's
 * animation loop through `register`; this component only re-renders when their state changes.
 */
export const RoomMember = memo(function RoomMember({ m, r, compact, leaving, focus, register, onHover, onSelect }: Props) {
  const els: Partial<NodeEls> & { ripples: SVGCircleElement[] } = { ripples: [] };
  const sync = () => register(m.user.id, els.root && els.tremble && els.ring ? (els as NodeEls) : null);
  const label = m.isMe ? `${m.user.name} (you)` : m.user.name;
  const status = [
    m.isFriend && "friend",
    m.speaking && "speaking",
    m.mic === "off" && "muted",
    m.mic === "none" && !m.isMe && "not connected to voice",
    m.sharing && "sharing their screen",
  ]
    .filter(Boolean)
    .join(", ");
  const nameSize = Math.max(11, Math.min(13, r * 0.46));
  const showLabels = !compact || focus === "hovered";
  const badge = Math.max(14, r * 0.52);

  return (
    <g
      ref={(el) => {
        if (el) els.root = el;
        else delete els.root;
        sync();
      }}
      role="button"
      tabIndex={leaving ? -1 : 0}
      aria-label={status ? `${label}, ${status}` : label}
      className={cn("room-node cursor-pointer outline-none", leaving ? "room-node-leaving" : "room-node-in")}
      style={{ opacity: leaving ? 0 : focus === "dim" ? 0.4 : 1 }}
      onPointerEnter={() => onHover(m.user.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(m.user.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(m.user, (e.currentTarget as SVGGElement).getBoundingClientRect());
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect(m.user, (e.currentTarget as SVGGElement).getBoundingClientRect());
      }}
    >
      <g
        ref={(el) => {
          if (el) els.tremble = el;
          else delete els.tremble;
          sync();
        }}
      >
        {/* cheap glow: a radial gradient disc instead of a blur filter on a moving element */}
        <circle r={r * 2} fill={`url(#glow-${m.user.id})`} opacity={focus === "hovered" ? 1 : 0.7} />
        <radialGradient id={`glow-${m.user.id}`}>
          <stop offset="35%" stopColor={rgba(m.color, 0.45)} />
          <stop offset="100%" stopColor={rgba(m.color, 0)} />
        </radialGradient>

        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            ref={(el) => {
              if (el) els.ripples[i] = el;
              sync();
            }}
            r={r}
            fill="none"
            stroke={m.color}
            strokeWidth={1.5}
            opacity={0}
          />
        ))}
        <circle
          ref={(el) => {
            if (el) els.ring = el;
            else delete els.ring;
            sync();
          }}
          r={r + 3}
          fill="none"
          stroke={m.color}
          strokeWidth={2.5}
          opacity={0}
        />

        <g className="room-node-scale" style={{ transform: `scale(${focus === "hovered" ? 1.15 : 1})` }}>
          <circle r={r} fill={m.color} />
          {m.user.avatarUrl ? (
            <>
              <clipPath id={`clip-${m.user.id}`}>
                <circle r={r - 1.5} />
              </clipPath>
              <image
                href={m.user.avatarUrl}
                x={-r}
                y={-r}
                width={r * 2}
                height={r * 2}
                clipPath={`url(#clip-${m.user.id})`}
                preserveAspectRatio="xMidYMid slice"
              />
            </>
          ) : (
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.62} fontWeight={700} fill="rgba(3,5,12,0.85)">
              {initials(m.user.name)}
            </text>
          )}
          <circle r={r} fill="url(#member-shine)" />
          <circle r={r} fill="none" stroke="rgba(255,255,255,0.3)" />
          {m.isMe && <circle r={r + 4} fill="none" stroke="#fff" strokeWidth={1.6} />}
        </g>

        {m.mic === "off" && (
          <g transform={`translate(${r * 0.72} ${r * 0.72})`}>
            <circle r={badge / 2 + 2} fill="#0A1230" stroke="rgba(251,113,133,0.6)" />
            <MicOff x={-badge / 2 + 3} y={-badge / 2 + 3} width={badge - 6} height={badge - 6} color="#FB7185" strokeWidth={2.5} />
          </g>
        )}
        {m.sharing && (
          <g transform={`translate(${-r * 0.72} ${r * 0.72})`}>
            <circle r={badge / 2 + 2} fill="#0A1230" stroke="rgba(34,211,238,0.6)" />
            <MonitorUp x={-badge / 2 + 3} y={-badge / 2 + 3} width={badge - 6} height={badge - 6} color="#22D3EE" strokeWidth={2.5} />
          </g>
        )}
      </g>

      {showLabels && (
        <text
          y={r + nameSize + 6}
          textAnchor="middle"
          fontSize={nameSize}
          fontWeight={m.speaking || m.isMe ? 600 : 500}
          fill={m.speaking ? "#ffffff" : "rgba(230,236,255,0.86)"}
          style={{ paintOrder: "stroke", stroke: "rgba(3,5,12,0.75)", strokeWidth: 3 }}
        >
          {label}
        </text>
      )}
      {showLabels && (m.isFriend || m.speaking) && (
        <text
          y={r + nameSize * 2 + 9}
          textAnchor="middle"
          fontSize={nameSize - 2}
          fontWeight={600}
          letterSpacing={0.4}
          fill={m.speaking ? m.color : "rgba(167,139,250,0.9)"}
          style={{ paintOrder: "stroke", stroke: "rgba(3,5,12,0.75)", strokeWidth: 3 }}
        >
          {m.speaking ? "speaking" : "friend"}
        </text>
      )}
    </g>
  );
});
