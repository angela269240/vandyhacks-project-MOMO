import { memo } from "react";

export type EdgeEls = { line: SVGLineElement; glow: SVGLineElement; grad: SVGLinearGradientElement };

export type DrawnEdge = {
  key: string;
  a: string;
  b: string;
  colorA: string;
  colorB: string;
  /** one end is leaving the room: fade out */
  fading: boolean;
  emphasis: "normal" | "mine" | "highlight" | "dim";
};

const OPACITY = { normal: 0.26, mine: 0.4, highlight: 0.9, dim: 0.07 } as const;

/**
 * Accepted friendships between people in the room, as their own layer under the nodes.
 * Endpoints are written every frame by the room's animation loop so lines stay attached to floating nodes.
 */
export const RoomFriendshipEdges = memo(function RoomFriendshipEdges({
  edges,
  register,
}: {
  edges: DrawnEdge[];
  register: (key: string, els: EdgeEls | null) => void;
}) {
  return (
    <g aria-hidden>
      {edges.map((e) => (
        <EdgeLine key={e.key} edge={e} register={register} />
      ))}
    </g>
  );
});

function EdgeLine({ edge, register }: { edge: DrawnEdge; register: (key: string, els: EdgeEls | null) => void }) {
  const els: Partial<EdgeEls> = {};
  const set = <K extends keyof EdgeEls>(k: K) => (el: EdgeEls[K] | null) => {
    if (el) els[k] = el;
    else delete els[k];
    register(edge.key, els.line && els.glow && els.grad ? (els as EdgeEls) : null);
  };
  const id = `edge-${edge.key.replace(/[^a-zA-Z0-9-]/g, "_")}`;
  const highlight = edge.emphasis === "highlight";

  return (
    <g className="room-edge-in">
      <linearGradient id={id} gradientUnits="userSpaceOnUse" ref={set("grad")}>
        <stop offset="0%" stopColor={edge.colorA} />
        <stop offset="100%" stopColor={edge.colorB} />
      </linearGradient>
      <line
        ref={set("glow")}
        stroke={`url(#${id})`}
        strokeWidth={6}
        strokeLinecap="round"
        style={{ opacity: 0 }}
      />
      <line
        ref={set("line")}
        stroke={`url(#${id})`}
        strokeWidth={highlight ? 1.6 : 1.1}
        strokeLinecap="round"
        style={{
          opacity: edge.fading ? 0 : OPACITY[edge.emphasis],
          transition: "opacity 400ms ease, stroke-width 200ms ease",
        }}
      />
    </g>
  );
}
