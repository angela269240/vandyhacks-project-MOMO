"use client";

import { MessageCircle, Users } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDm } from "@/hooks/useDm";
import { useGraph, useInterests } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { identityColor, interestColor } from "@/lib/colors";
import type { GraphUser } from "@/lib/types";
import { Avatar } from "../profile/Avatar";

/**
 * Top-bar friends list (next to the requests bell). Hovering a friend shows their profile beside the list;
 * Message opens (or refocuses) the chat with them. People in a room are listed first.
 */
export function FriendsMenu() {
  const { friends, me } = useMe();
  const { data: graph } = useGraph();
  const { openChat } = useDm();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<{ id: string; top: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const list = friends.friends
    .map((id) => graph?.users.find((u) => u.id === id))
    .filter((u): u is GraphUser => Boolean(u))
    .sort((a, b) => Number(b.inRoom) - Number(a.inRoom) || a.name.localeCompare(b.name));
  const groupName = (u: GraphUser) => graph?.groups.find((g) => g.id === u.groupId)?.name ?? null;
  const preview = hovered && list.find((u) => u.id === hovered.id);

  const message = (id: string) => {
    openChat(id);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setHovered(null);
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-lg" className="glass relative rounded-full" aria-label="Friends" />}
      >
        <Users />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="relative w-72 p-3" onMouseLeave={() => setHovered(null)}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-heading text-sm font-semibold">Friends</span>
          {list.length > 0 && <span className="text-xs text-muted-foreground">{list.length}</span>}
        </div>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No friends yet. Add someone from their profile.</p>
        ) : (
          <ul
            ref={listRef}
            className="-mx-1 flex max-h-80 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1"
            onScroll={() => setHovered(null)}
          >
            {list.map((u) => {
              const where = groupName(u);
              return (
                <li
                  key={u.id}
                  onMouseEnter={(e) => {
                    const row = e.currentTarget;
                    // relative to the popup, so the preview lines up with the row even when the list is scrolled
                    setHovered({ id: u.id, top: row.offsetTop - (listRef.current?.scrollTop ?? 0) });
                  }}
                  className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-foreground/5 data-[active=true]:bg-foreground/5"
                  data-active={hovered?.id === u.id}
                >
                  <span className="relative">
                    <Avatar name={u.name} url={u.avatarUrl} color={identityColor(u)} size={32} />
                    {u.inRoom && (
                      <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-(--hue-sage) ring-2 ring-popover" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {where ? (u.away ? `Recently in ${where}` : `In ${where}`) : "Wandering the map"}
                    </span>
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Message ${u.name}`} title="Message" onClick={() => message(u.id)}>
                    <MessageCircle />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {preview && me && (
          <FriendPreview user={preview} where={groupName(preview)} myInterests={me.interestIds} top={hovered.top} onMessage={() => message(preview.id)} />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The hovered friend's profile, to the left of the list (the menu sits at the top-right of the screen). */
function FriendPreview({
  user,
  where,
  myInterests,
  top,
  onMessage,
}: {
  user: GraphUser;
  where: string | null;
  myInterests: number[];
  top: number;
  onMessage: () => void;
}) {
  const interests = useInterests();
  const mine = new Set(myInterests);
  return (
    // pr-2 instead of a margin: the gap stays part of the menu, so moving the mouse across it keeps the preview open
    <div style={{ top: Math.max(0, top) }} className="absolute right-full hidden pr-2 sm:block">
    <div role="tooltip" className="w-64 rounded-xl bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <div className="flex items-center gap-2.5">
        <Avatar name={user.name} url={user.avatarUrl} color={identityColor(user)} size={40} />
        <div className="min-w-0">
          <div className="truncate font-heading text-sm font-semibold">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {where ? (user.away ? `Recently in ${where}` : `In ${where}`) : "Wandering the map"}
          </div>
        </div>
      </div>
      {user.bio && <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">{user.bio}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {user.interestIds.map((id) => {
          const interest = interests.find((i) => i.id === id);
          if (!interest) return null;
          return (
            <Badge
              key={id}
              variant="outline"
              className={mine.has(id) ? "tag-active" : "border-foreground/15 text-muted-foreground"}
              style={{ "--tag": interestColor(id) } as React.CSSProperties}
            >
              {interest.name}
            </Badge>
          );
        })}
      </div>
      <Button size="sm" className="mt-3 w-full" onClick={onMessage}>
        <MessageCircle /> Message
      </Button>
    </div>
    </div>
  );
}
