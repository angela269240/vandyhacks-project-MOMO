"use client";

import { Check, Pin, Search, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { BookmarksSection } from "@/components/bookmarks/BookmarksSection";
import { Avatar } from "@/components/profile/Avatar";
import { useBookmarks } from "@/hooks/useBookmarks";
import { CATEGORIES } from "@/lib/categories";
import { useGroupColor } from "@/lib/client/groupHues";
import { identityColor } from "@/lib/colors";
import type { GraphGroup, GraphUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SearchPick = { kind: "group"; id: number } | { kind: "user"; id: string };

export const SIDEBAR_WIDTH = 300;
const MAX_RESULTS = 6;

/** The query's first match in `text`, wrapped in a highlight. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-primary/25 text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <h3 className="font-heading text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{children}</h3>
      {aside && <div className="ml-auto flex items-center gap-1">{aside}</div>}
    </div>
  );
}

/** Left-hand menu behind the hamburger: search, pinned bubbles, bookmarks and tag filters. */
export function MapSidebar({
  open,
  onClose,
  groups,
  users,
  query,
  onQuery,
  picked,
  onPick,
  uncheckedTags,
  onUncheckedTags,
  activeBookmarkId,
  onActiveBookmark,
  onEnterGroup,
}: {
  open: boolean;
  onClose: () => void;
  groups: GraphGroup[];
  users: GraphUser[];
  query: string;
  onQuery: (q: string) => void;
  picked: SearchPick | null;
  onPick: (pick: SearchPick, label: string) => void;
  uncheckedTags: Set<string>;
  onUncheckedTags: (next: Set<string>) => void;
  activeBookmarkId: string | null;
  onActiveBookmark: (id: string | null) => void;
  onEnterGroup: (group: GraphGroup) => void;
}) {
  const { pinnedIds, togglePin, ready } = useBookmarks();
  const groupColor = useGroupColor();
  const [searchFocused, setSearchFocused] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // ---- search: bubble and person names only ----
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return { groups: [], users: [] };
    const starts = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    const byRank = <T extends { name: string }>(a: T, b: T) => starts(a.name) - starts(b.name) || a.name.localeCompare(b.name);
    return {
      groups: groups.filter((g) => g.name.toLowerCase().includes(q)).sort(byRank).slice(0, MAX_RESULTS),
      users: users.filter((u) => u.name.toLowerCase().includes(q)).sort(byRank).slice(0, MAX_RESULTS),
    };
  }, [q, groups, users]);
  const showResults = searchFocused && q.length > 0 && !picked;
  const first: [SearchPick, string] | null = results.groups[0]
    ? [{ kind: "group", id: results.groups[0].id }, results.groups[0].name]
    : results.users[0]
      ? [{ kind: "user", id: results.users[0].id }, results.users[0].name]
      : null;

  // ---- filters ----
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.category, (m.get(g.category) ?? 0) + 1);
    return m;
  }, [groups]);
  const tq = tagQuery.trim().toLowerCase();
  const tagHits = tq ? CATEGORIES.filter((c) => c.toLowerCase().includes(tq)) : [];
  const toggleTag = (tag: string) => {
    const next = new Set(uncheckedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onUncheckedTags(next);
  };

  const pinned = pinnedIds.map((id) => byId.get(id)).filter((g): g is GraphGroup => Boolean(g));

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="map-sidebar"
          initial={{ x: -SIDEBAR_WIDTH - 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -SIDEBAR_WIDTH - 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          aria-label="Map menu"
          className="glass fixed top-3 bottom-3 left-3 z-40 flex max-w-[calc(100vw-24px)] flex-col rounded-2xl elevated"
          style={{ width: SIDEBAR_WIDTH }}
        >
          {/* search on top, outside the scroll area so its results can float over the sections */}
          <div className="relative flex items-center gap-2 p-3 pb-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-foreground/5 px-3 text-sm focus-within:ring-2 focus-within:ring-ring/50">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && first) onPick(...first);
                  if (e.key === "Escape") onQuery("");
                }}
                placeholder="Search people or bubbles"
                aria-label="Search people or bubbles"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button aria-label="Clear search" onClick={() => onQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            {showResults && (
              <div
                role="listbox"
                aria-label="Search results"
                // keep focus in the input while clicking a result
                onMouseDown={(e) => e.preventDefault()}
                className="absolute inset-x-3 top-full z-10 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-background p-1.5 text-popover-foreground shadow-lg"
              >
                {results.groups.length + results.users.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No person or bubble called “{query.trim()}”</p>
                )}
                {results.groups.length > 0 && <p className="px-2 pt-1 pb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">Bubbles</p>}
                {results.groups.map((g) => (
                  <button
                    key={g.id}
                    role="option"
                    aria-selected={false}
                    onClick={() => onPick({ kind: "group", id: g.id }, g.name)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/10"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ background: groupColor(g) }} />
                    <span className="min-w-0 flex-1 truncate">
                      <Highlight text={g.name} query={query} />
                    </span>
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
                      <Users className="size-3" /> {g.memberCount}
                    </span>
                  </button>
                ))}
                {results.users.length > 0 && <p className="px-2 pt-1.5 pb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">People</p>}
                {results.users.map((u) => (
                  <button
                    key={u.id}
                    role="option"
                    aria-selected={false}
                    onClick={() => onPick({ kind: "user", id: u.id }, u.name)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/10"
                  >
                    <Avatar name={u.name} url={u.avatarUrl} color={identityColor(u)} size={20} />
                    <span className="min-w-0 flex-1 truncate">
                      <Highlight text={u.name} query={query} />
                    </span>
                    {u.groupId !== null && (
                      <span className="max-w-[40%] truncate text-[11px] text-muted-foreground">{byId.get(u.groupId)?.name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4" data-scroll-region>
            <section className="mb-5">
              <SectionTitle>Pinned</SectionTitle>
              {pinned.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {ready ? "Double-click a bubble to pin it here." : "Create a profile to pin bubbles."}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {pinned.map((g) => (
                    <li key={g.id} className="group flex items-center gap-2 rounded-lg px-1 hover:bg-foreground/5">
                      <button onClick={() => onEnterGroup(g)} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left text-sm" title={`Enter ${g.name}`}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: groupColor(g) }} />
                        <span className="truncate">{g.name}</span>
                        {g.activeCount > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{g.activeCount} here</span>}
                      </button>
                      <button
                        onClick={() => togglePin(g.id)}
                        aria-label={`Unpin ${g.name}`}
                        className="rounded p-1 text-primary opacity-60 transition hover:opacity-100 group-hover:opacity-100"
                      >
                        <Pin className="size-3.5 fill-current" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mb-5">
              <SectionTitle>Bookmarks</SectionTitle>
              <BookmarksSection groups={groups} activeId={activeBookmarkId} onApply={onActiveBookmark} />
            </section>

            <section>
              <SectionTitle
                aside={
                  <>
                    <button onClick={() => onUncheckedTags(new Set())} className="rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
                      All
                    </button>
                    <button
                      onClick={() => onUncheckedTags(new Set(CATEGORIES))}
                      className="rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    >
                      None
                    </button>
                  </>
                }
              >
                Filters
              </SectionTitle>

              <div className="relative mb-1.5">
                <label className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground/5 px-2.5 text-xs focus-within:ring-2 focus-within:ring-ring/50">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    onFocus={() => setTagFocused(true)}
                    onBlur={() => setTagFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setTagQuery("");
                      if (e.key === "Enter" && tagHits[0]) toggleTag(tagHits[0]);
                    }}
                    placeholder="Find a tag"
                    aria-label="Find a tag"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                  {tagQuery && (
                    <button aria-label="Clear tag search" onClick={() => setTagQuery("")} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  )}
                </label>
                {tq && tagFocused && (
                  <div
                    role="listbox"
                    aria-label="Matching tags"
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-background p-1 text-popover-foreground shadow-lg">
                    {tagHits.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No tag matches</p>}
                    {tagHits.map((tag) => {
                      const on = !uncheckedTags.has(tag);
                      return (
                        <button
                          key={tag}
                          role="option"
                          aria-selected={on}
                          onClick={() => toggleTag(tag)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-foreground/10"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <Highlight text={tag} query={tagQuery} />
                          </span>
                          {on && <Check className="size-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <ul className="flex flex-col">
                {CATEGORIES.map((tag) => {
                  const on = !uncheckedTags.has(tag);
                  return (
                    <li key={tag}>
                      <button
                        onClick={() => toggleTag(tag)}
                        aria-pressed={on}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-foreground/5"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate", !on && "text-muted-foreground")}>{tag}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{tagCounts.get(tag) ?? 0}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
