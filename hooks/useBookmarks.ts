"use client";

import { toast } from "sonner";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import type { Bookmark, User } from "@/lib/types";

/** My bookmark lists (stored on my user record), with optimistic saves. */
export function useBookmarks() {
  const { me, setMe, refreshMe } = useMe();
  const bookmarks = me?.bookmarks ?? [];

  const save = async (next: Bookmark[]) => {
    if (!me) return;
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
  };
}
