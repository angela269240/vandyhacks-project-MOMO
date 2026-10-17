"use client";

import { Bell, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/client/api";
import { INTERESTS } from "@/lib/interests";
import { Avatar } from "../profile/Avatar";

export function RequestsBell() {
  const { friends, refreshFriends } = useMe();
  const { data: graph } = useGraph();
  const incoming = friends.incoming
    .map((id) => graph?.users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const respond = async (other: string, accept: boolean) => {
    try {
      await api("/api/friends/respond", { body: { other, accept } });
      await refreshFriends();
      if (accept) toast.success("New connection on the map");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-lg" className="glass relative rounded-full" aria-label="Friend requests" />
        }
      >
        <Bell />
        {incoming.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#F472B6] text-[10px] font-bold text-black shadow-[0_0_10px_#F472B6]">
            {incoming.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="mb-1 font-heading text-sm font-semibold">Friend requests</div>
        {incoming.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet. Say hi to someone on the map.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incoming.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-white/5">
                <Avatar
                  name={u.name}
                  url={u.avatarUrl}
                  color={INTERESTS.find((i) => i.id === u.interestIds[0])?.color ?? "#60A5FA"}
                  size={32}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                <Button size="icon-sm" aria-label={`Accept ${u.name}`} onClick={() => respond(u.id, true)}>
                  <Check />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Decline ${u.name}`} onClick={() => respond(u.id, false)}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
