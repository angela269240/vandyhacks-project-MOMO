"use client";

import { Check, Clock, Pencil, UserPlus, X } from "lucide-react";
import { motion } from "motion/react";
import { forwardRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInterests } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import { useGroupColor } from "@/lib/client/groupHues";
import { identityColor, interestColor } from "@/lib/colors";
import type { GraphGroup, GraphUser } from "@/lib/types";
import { Avatar } from "./Avatar";

/** lucide dropped brand marks; a minimal LinkedIn glyph in the same stroke style. */
function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

type Props = {
  user: GraphUser;
  groupName?: string | null;
  /** every community they've joined (their node shows in only one at a time) */
  communities?: GraphGroup[];
  onClose: () => void;
  onEditProfile: () => void;
  style?: React.CSSProperties;
};

/** Mini profile window. Shared interests are tinted; the map highlights mutual-connection edges while it's open. */
export const ProfileCard = forwardRef<HTMLDivElement, Props>(function ProfileCard(
  { user, groupName, communities = [], onClose, onEditProfile, style },
  ref,
) {
  const interests = useInterests();
  const { me, friends, refreshFriends } = useMe();
  const [busy, setBusy] = useState(false);
  const isMe = me?.id === user.id;
  const mine = new Set(me?.interestIds ?? []);
  const groupColor = useGroupColor();

  const status = friends.friends.includes(user.id)
    ? "friends"
    : friends.outgoing.includes(user.id)
      ? "outgoing"
      : friends.incoming.includes(user.id)
        ? "incoming"
        : "none";

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      await refreshFriends();
      toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Outer div is positioned by the caller (transform written per frame); inner div owns the pop-in animation.
    <div
      ref={ref}
      style={style}
      role="dialog"
      aria-label={`${user.name}'s profile`}
      className="pointer-events-auto fixed top-0 left-0 z-30 w-[300px] max-w-[calc(100vw-24px)]"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="glass elevated relative rounded-2xl p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute top-3 right-3 rounded-full p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-3 pr-6">
        <Avatar name={user.name} url={user.avatarUrl} color={identityColor(user)} size={48} />
        <div className="min-w-0">
          <div className="truncate font-heading text-base font-semibold">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {groupName ? (user.away ? `Recently in ${groupName}` : `In ${groupName}`) : "Wandering the map"}
          </div>
        </div>
      </div>

      {communities.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="tracking-wider uppercase">Communities</span>
          {communities.map((g) => (
            <span key={g.id} className="flex items-center gap-1 text-foreground/80">
              <span className="size-1.5 rounded-full" style={{ background: groupColor(g) }} />
              {g.name}
            </span>
          ))}
        </div>
      )}

      {user.bio && <p className="mt-3 text-sm leading-relaxed text-foreground/85">{user.bio}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {user.interestIds.map((id) => {
          const interest = interests.find((i) => i.id === id);
          if (!interest) return null;
          const shared = !isMe && mine.has(id);
          return (
            <Badge
              key={id}
              variant="outline"
              className={shared ? "tag-active" : "border-foreground/15 text-muted-foreground"}
              style={{ "--tag": interestColor(id) } as React.CSSProperties}
            >
              {interest.name}
            </Badge>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {isMe ? (
          <Button size="sm" variant="secondary" onClick={onEditProfile}>
            <Pencil /> Edit profile
          </Button>
        ) : !me ? null : status === "friends" ? (
          <Button size="sm" variant="secondary" disabled>
            <Check /> Friends
          </Button>
        ) : status === "outgoing" ? (
          <Button size="sm" variant="secondary" disabled>
            <Clock /> Requested
          </Button>
        ) : status === "incoming" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act(() => api("/api/friends/respond", { body: { other: user.id, accept: true } }), "You're now friends")}
          >
            <Check /> Accept request
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act(() => api("/api/friends/request", { body: { to: user.id } }), "Friend request sent")}
          >
            <UserPlus /> Add friend
          </Button>
        )}
        {user.linkedin && (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={user.linkedin} target="_blank" rel="noopener noreferrer" />}
          >
            <LinkedinIcon /> LinkedIn
          </Button>
        )}
      </div>
    </motion.div>
    </div>
  );
});
