"use client";

import { Check, Pin, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { GraphGroup } from "@/lib/types";

/** Mini window from double-clicking a bubble: pin it, or "Add to: [bookmarks]". */
export function AddToBookmark({
  group,
  at,
  onClose,
}: {
  group: GraphGroup;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const { bookmarks, pinnedIds, add, toggleGroup, togglePin } = useBookmarks();
  const pinned = pinnedIds.includes(group.id);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(at.x + 8, window.innerWidth - 248);
  const top = Math.min(at.y + 8, window.innerHeight - 280);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="glass fixed z-50 w-60 origin-top-left rounded-xl p-2 elevated"
      style={{ left, top }}
      role="dialog"
      aria-label={`Add ${group.name} to a bookmark`}
    >
      <button
        onClick={() => togglePin(group.id)}
        aria-pressed={pinned}
        className="mb-1 flex w-full items-center gap-2 rounded-lg border-b border-border px-2 py-1.5 text-left text-sm hover:bg-foreground/10"
      >
        <Pin className={`size-4 ${pinned ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        <span className="truncate">{pinned ? "Pinned" : "Pin"} {group.name}</span>
      </button>
      <div className="truncate px-2 pt-1 pb-2 text-xs text-muted-foreground">
        Add <span className="font-medium text-foreground">{group.name}</span> to:
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {bookmarks.map((b) => {
          const on = b.groupIds.includes(group.id);
          return (
            <li key={b.id}>
              <button
                onClick={() => toggleGroup(b.id, group.id)}
                aria-pressed={on}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-foreground/10"
              >
                <span className={`flex size-4 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="truncate">{b.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          add(name, [group.id]);
          setName("");
        }}
        className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-2"
      >
        <Plus className="size-3.5 text-muted-foreground" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New bookmark…"
          maxLength={40}
          autoFocus={bookmarks.length === 0}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>
    </motion.div>
  );
}
