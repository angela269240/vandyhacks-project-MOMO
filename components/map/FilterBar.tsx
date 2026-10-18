"use client";

import { Bookmark, Search, X } from "lucide-react";
import { type Chip, type ChipState, nextChipState, stateOf } from "@/lib/client/filters";
import { cn } from "@/lib/utils";

/** One translucent bar across the top: Select all / Select none, tri-state chips, and search. */
export function FilterBar({
  chips,
  states,
  onStates,
  query,
  onQuery,
}: {
  chips: Chip[];
  states: Record<string, ChipState>;
  onStates: (next: Record<string, ChipState>) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const setAll = (s: ChipState) => onStates(Object.fromEntries(chips.map((c) => [c.key, s])));

  return (
    <div
      role="toolbar"
      aria-label="Filter bubbles"
      className="glass pointer-events-auto flex h-11 w-full max-w-[min(1100px,calc(100vw-24px))] items-center gap-2 rounded-full pr-1.5 pl-3 elevated"
    >
      <div className="flex shrink-0 items-center gap-1 text-xs">
        <button onClick={() => setAll("on")} className="rounded-full px-2 py-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          Select all
        </button>
        <button onClick={() => setAll("off")} className="rounded-full px-2 py-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          Select none
        </button>
      </div>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]" data-scroll-region>
        {chips.map((chip) => {
          const s = stateOf(states, chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => onStates({ ...states, [chip.key]: nextChipState[s] })}
              aria-label={`${chip.label}: ${s === "on" ? "included" : s === "off" ? "not included" : s === "exclude" ? "excluded" : "no rule"}`}
              title="Click: uncheck → exclude → no rule"
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap transition",
                s === "on" && "border-primary/60 bg-primary/15 text-foreground",
                s === "off" && "border-border text-muted-foreground",
                s === "exclude" && "border-destructive/60 bg-destructive/10 text-destructive line-through",
                s === "none" && "border-dashed border-border text-muted-foreground/70",
              )}
            >
              {s === "exclude" ? <X className="size-3" /> : chip.kind === "bookmark" ? <Bookmark className="size-3" /> : null}
              {chip.label}
            </button>
          );
        })}
      </div>

      <label className="flex h-8 w-44 shrink-0 items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 text-xs focus-within:ring-2 focus-within:ring-ring/50 sm:w-56">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Bookmark, tag, person, bubble…"
          aria-label="Search bubbles"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button aria-label="Clear search" onClick={() => onQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </label>
    </div>
  );
}
