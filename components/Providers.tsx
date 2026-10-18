"use client";

import { SWRConfig, useSWRConfig } from "swr";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { refreshGraph } from "@/hooks/useGraph";
import { MeProvider, useMe } from "@/hooks/useMe";
import { useLobby } from "@/hooks/useRealtime";
import { useTheme } from "@/hooks/useTheme";
import { sceneEvents } from "@/lib/client/scene";
import type { LobbyEvent } from "@/lib/types";

/** Applies lobby events: refresh the map, refresh my friend state, toast requests addressed to me. */
function LobbyListener() {
  const { signedIn } = useMe();
  return signedIn ? <SignedInLobbyListener /> : null;
}

function SignedInLobbyListener() {
  const { mutate } = useSWRConfig();
  const { identity, refreshFriends } = useMe();

  useLobby<LobbyEvent>((event) => {
    refreshGraph(mutate);
    const me = identity?.userId;
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
        <TooltipProvider delay={250}>
          <LobbyListener />
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </MeProvider>
    </SWRConfig>
  );
}
