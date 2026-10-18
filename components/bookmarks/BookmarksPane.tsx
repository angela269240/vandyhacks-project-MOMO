"use client";

import { Bookmark, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useGroupColor } from "@/lib/client/groupHues";
import type { GraphGroup } from "@/lib/types";

/** Translucent pane that slides in from the left with your bookmark lists. */
export function BookmarksPane({
  open,
  onClose,
  groups,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  groups: GraphGroup[];
  /** focus the map on this bookmark's bubbles */
  onApply: (bookmarkId: string) => void;
}) {
  const { bookmarks, ready, add, remove, toggleGroup } = useBookmarks();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const byId = new Map(groups.map((g) => [g.id, g]));
  const groupColor = useGroupColor();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    add(name);
    setName("");
    setAdding(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="bookmarks"
          initial={{ x: -340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -340, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          data-scroll-region
          aria-label="Bookmarks"
          className="glass fixed top-3 bottom-3 left-3 z-40 flex w-[300px] max-w-[calc(100vw-24px)] flex-col rounded-2xl elevated"
        >
          <header className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Bookmark className="size-4" />
            <h2 className="font-heading text-sm font-semibold">Bookmarks</h2>
            <button onClick={onClose} aria-label="Close bookmarks" className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            {!ready ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">Create a profile to save bookmarks.</p>
            ) : bookmarks.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No bookmarks yet. Add one below, then double-click a bubble to file it.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bookmarks.map((b) => {
                  const live = b.groupIds.map((id) => byId.get(id)).filter((g): g is GraphGroup => Boolean(g));
                  return (
                    <li key={b.id} className="group rounded-xl border border-border bg-foreground/[0.03] p-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onApply(b.id)}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                          title="Show only these bubbles"
                        >
                          {b.name}
                        </button>
                        <span className="text-xs text-muted-foreground tabular-nums">{live.length}</span>
                        <button
                          onClick={() => remove(b.id)}
                          aria-label={`Delete ${b.name}`}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {live.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {live.map((g) => (
                            <span key={g.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2 text-[11px]">
                              <span className="size-1.5 rounded-full" style={{ background: groupColor(g) }} />
                              {g.name}
                              <button aria-label={`Remove ${g.name}`} onClick={() => toggleGroup(b.id, g.id)} className="rounded-full p-0.5 hover:bg-foreground/10">
                                <X className="size-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {ready && (
            <footer className="border-t border-border p-3">
              {adding ? (
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => !name && setAdding(false)}
                    onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                    maxLength={40}
                    placeholder="Bookmark name"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
                    Add
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  aria-label="Add bookmark"
                  className="mx-auto flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                >
                  <Plus className="size-4" />
                </button>
              )}
            </footer>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
