"use client";

import { toast } from "sonner";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import type { Bookmark, User } from "@/lib/types";

/**
 * Pinned bubbles ride along in the bookmarks JSON as one reserved entry, so pinning needs no schema change.
 * It never shows up as a bookmark list.
 */
export const PINNED_ID = "__pinned__";

/** My bookmark lists and pinned bubbles (stored on my user record), with optimistic saves. */
export function useBookmarks() {
  const { me, setMe, refreshMe } = useMe();
  const all = me?.bookmarks ?? [];
  const bookmarks = all.filter((b) => b.id !== PINNED_ID);
  const pinnedIds = all.find((b) => b.id === PINNED_ID)?.groupIds ?? [];

  const save = async (nextBookmarks: Bookmark[], nextPinned: number[] = pinnedIds) => {
    if (!me) return;
    const next = nextPinned.length ? [...nextBookmarks, { id: PINNED_ID, name: "Pinned", groupIds: nextPinned }] : nextBookmarks;
    setMe({ ...me, bookmarks: next });
    try {
      await api<User>(`/api/users/${me.id}`, { method: "PATCH", body: { bookmarks: next } });
    } catch (e) {
      toast.error("Couldn't save bookmarks", { description: (e as Error).message });
      refreshMe();
    }
  };

  return {
    bookmarks,
    pinnedIds,
    ready: Boolean(me),
    add: (name: string, groupIds: number[] = []) =>
      save([...bookmarks, { id: Math.random().toString(36).slice(2, 10), name: name.trim(), groupIds }]),
    remove: (id: string) => save(bookmarks.filter((b) => b.id !== id)),
    toggleGroup: (id: string, groupId: number) =>
      save(
        bookmarks.map((b) =>
          b.id !== id
            ? b
            : { ...b, groupIds: b.groupIds.includes(groupId) ? b.groupIds.filter((g) => g !== groupId) : [...b.groupIds, groupId] },
        ),
      ),
    togglePin: (groupId: number) =>
      save(bookmarks, pinnedIds.includes(groupId) ? pinnedIds.filter((g) => g !== groupId) : [...pinnedIds, groupId]),
  };
}
