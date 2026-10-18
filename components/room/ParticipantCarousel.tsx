"use client";

import { ChevronLeft, ChevronRight, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GraphUser } from "@/lib/types";
import { ParticipantCard } from "./ParticipantCard";
import type { StageMember } from "./RoomMember";

const SPEAKER_DEBOUNCE_MS = 700;
/** after the user scrolls the strip themselves, don't move it for them for this long */
const HANDS_OFF_MS = 5000;

/**
 * Stable order: whoever is sharing, then you, then everyone else in the order they arrived.
 * Speaking never reorders cards; an off-screen active speaker is scrolled into view, or, if you're
 * browsing the strip yourself, shown in a spotlight chip instead of stealing your scroll position.
 */
export function ParticipantCarousel({
  members,
  sharerId,
  friendsOf,
  onSelect,
}: {
  members: StageMember[];
  sharerId: string | null;
  friendsOf: Map<string, Set<string>>;
  onSelect: (user: GraphUser, rect: DOMRect) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const lastManual = useRef(0);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [spotlight, setSpotlight] = useState<StageMember | null>(null);

  // arrival order, remembered across renders
  const [arrival] = useState(() => new Map<string, number>());
  const ordered = useMemo(() => {
    for (const m of members) if (!arrival.has(m.user.id)) arrival.set(m.user.id, arrival.size);
    const rank = (m: StageMember) => (m.user.id === sharerId ? -2 : m.isMe ? -1 : (arrival.get(m.user.id) ?? 0));
    return [...members].sort((a, b) => rank(a) - rank(b));
  }, [members, sharerId, arrival]);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateArrows, ordered.length]);

  // Active speaker, debounced so brief sounds don't flicker the spotlight.
  const speakerId = ordered.find((m) => m.speaking && !m.isMe)?.user.id ?? null;
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setActive(speakerId), speakerId ? SPEAKER_DEBOUNCE_MS : SPEAKER_DEBOUNCE_MS * 2);
    return () => clearTimeout(timer);
  }, [speakerId]);

  useEffect(() => {
    const el = scrollRef.current;
    const card = active ? cards.current.get(active) : null;
    if (!el || !card) {
      setSpotlight(null);
      return;
    }
    const box = el.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const visible = c.left >= box.left - 2 && c.right <= box.right + 2;
    if (visible) return setSpotlight(null);
    if (Date.now() - lastManual.current > HANDS_OFF_MS) {
      card.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      setSpotlight(null);
    } else {
      setSpotlight(ordered.find((m) => m.user.id === active) ?? null);
    }
  }, [active, ordered]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    lastManual.current = Date.now();
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const mutualHere = (id: string) => {
    const mine = ordered.find((m) => m.isMe);
    if (!mine) return 0;
    const theirs = friendsOf.get(id);
    const myFriends = friendsOf.get(mine.user.id);
    if (!theirs || !myFriends) return 0;
    return ordered.filter((m) => m.user.id !== id && !m.isMe && theirs.has(m.user.id) && myFriends.has(m.user.id)).length;
  };

  return (
    <div className="relative flex h-[120px] shrink-0 items-center gap-2" aria-label="Participants" role="region">
      <ArrowButton side="left" enabled={edges.left} onClick={() => scrollBy(-1)} />
      <div
        ref={scrollRef}
        data-scroll-region
        onScroll={updateArrows}
        onWheel={() => (lastManual.current = Date.now())}
        onPointerDown={() => (lastManual.current = Date.now())}
        onTouchStart={() => (lastManual.current = Date.now())}
        className="flex h-full min-w-0 flex-1 snap-x items-center gap-2.5 overflow-x-auto scroll-smooth px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
      >
        {ordered.map((m) => (
          <ParticipantCard
            key={m.user.id}
            ref={(el) => {
              if (el) cards.current.set(m.user.id, el);
              else cards.current.delete(m.user.id);
            }}
            m={m}
            mutualHere={m.isMe ? 0 : mutualHere(m.user.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
      <ArrowButton side="right" enabled={edges.right} onClick={() => scrollBy(1)} />

      {spotlight && (
        <button
          onClick={() => cards.current.get(spotlight.user.id)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })}
          className="glass elevated absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ borderColor: spotlight.color }}
        >
          <Volume2 className="size-3.5" style={{ color: spotlight.color }} aria-hidden />
          {spotlight.user.name.split(" ")[0]} is speaking
        </button>
      )}
    </div>
  );
}

function ArrowButton({ side, enabled, onClick }: { side: "left" | "right"; enabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      aria-label={side === "left" ? "Previous participants" : "More participants"}
      className={cn(
        "glass hidden size-9 shrink-0 items-center justify-center rounded-full transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex",
        enabled ? "opacity-100 hover:bg-foreground/10" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
