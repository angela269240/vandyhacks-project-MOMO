"use client";

import { SWRConfig, useSWRConfig } from "swr";
import { toast } from "sonner";
import { DirectChatWindow } from "@/components/dm/DirectChatWindow";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dmPath, DmProvider, useDm } from "@/hooks/useDm";
import { GRAPH_KEY, refreshGraph } from "@/hooks/useGraph";
import { MeProvider, useMe } from "@/hooks/useMe";
import { useLobby } from "@/hooks/useRealtime";
import { useTheme } from "@/hooks/useTheme";
import { sceneEvents } from "@/lib/client/scene";
import type { Graph, LobbyEvent } from "@/lib/types";

/**
 * Applies lobby events: refresh the map, refresh my friend state, toast requests addressed to me, and refresh
 * direct chats I'm in (with a toast to open one that isn't on screen).
 */
function LobbyListener() {
  const { signedIn } = useMe();
  return signedIn ? <SignedInLobbyListener /> : null;
}

function SignedInLobbyListener() {
  const { mutate, cache } = useSWRConfig();
  const { identity, refreshFriends } = useMe();
  const { peerId, openChat } = useDm();

  useLobby<LobbyEvent>((event) => {
    const me = identity?.userId;
    if (event.type === "dm") {
      const { from, to } = event.payload;
      if (from === me) mutate(dmPath(to));
      if (to !== me) return;
      mutate(dmPath(from));
      if (peerId !== from) {
        const graph = cache.get(GRAPH_KEY)?.data as Graph | undefined;
        const name = graph?.users.find((u) => u.id === from)?.name ?? "Someone";
        toast(`New message from ${name}`, { action: { label: "Open", onClick: () => openChat(from) } });
      }
      return;
    }
    refreshGraph(mutate);
    switch (event.type) {
      case "user_moved":
        sceneEvents.emit("pulse-group", event.payload.groupId);
        break;
      case "friend_requested":
        if (event.payload.to === me) {
          refreshFriends();
          toast("New friend request", { description: "Open the bell to respond." });
        }
        if (event.payload.from === me) refreshFriends();
        break;
      case "friend_accepted":
        if (event.payload.a === me || event.payload.b === me) refreshFriends();
        break;
    }
  });
  return null;
}

function ThemedToaster() {
  return <Toaster position="bottom-left" theme={useTheme()} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
      <MeProvider>
        <DmProvider>
          <TooltipProvider delay={250}>
            <LobbyListener />
            {children}
            <DirectChatWindow />
            <ThemedToaster />
          </TooltipProvider>
        </DmProvider>
      </MeProvider>
    </SWRConfig>
  );
}
