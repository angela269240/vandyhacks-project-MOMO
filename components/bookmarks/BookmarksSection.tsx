"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useGroupColor } from "@/lib/client/groupHues";
import type { GraphGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The sidebar's Bookmarks section: your bookmark lists. Clicking one narrows the map to its bubbles (click again to undo). */
export function BookmarksSection({
  groups,
  activeId,
  onApply,
}: {
  groups: GraphGroup[];
  activeId: string | null;
  /** focus the map on this bookmark's bubbles, or null to clear */
  onApply: (bookmarkId: string | null) => void;
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
    <div>
      {!ready ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Create a profile to save bookmarks.</p>
      ) : bookmarks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">No bookmarks yet. Add one below, then double-click a bubble to file it.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bookmarks.map((b) => {
            const live = b.groupIds.map((id) => byId.get(id)).filter((g): g is GraphGroup => Boolean(g));
            const active = activeId === b.id;
            return (
              <li
                key={b.id}
                className={cn(
                  "group rounded-xl border p-2 transition",
                  active ? "border-primary/60 bg-primary/10" : "border-border bg-foreground/[0.03]",
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApply(active ? null : b.id)}
                    aria-pressed={active}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                    title={active ? "Show every bubble again" : "Show only these bubbles"}
                  >
                    {b.name}
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">{live.length}</span>
                  <button
                    onClick={() => {
                      if (active) onApply(null);
                      remove(b.id);
                    }}
                    aria-label={`Delete ${b.name}`}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {live.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
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

      {ready &&
        (adding ? (
          <form onSubmit={submit} className="mt-2 flex gap-2">
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
            className="mt-2 flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <Plus className="size-3.5" /> New bookmark
          </button>
        ))}
    </div>
  );
}
