"use client";

import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrbitLogo } from "@/components/brand/OrbitLogo";
import { RequestsBell } from "@/components/friends/RequestsBell";
import { NewGroupDialog } from "@/components/groups/NewGroupDialog";
import { Avatar } from "@/components/profile/Avatar";
import { EditProfileSheet } from "@/components/profile/ProfileDialogs";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { MinimizedRoomWidget } from "@/components/room/MinimizedRoomWidget";
import { useRoomConnection } from "@/components/room/RoomConnection";
import { Button } from "@/components/ui/button";
import { refreshGraph, useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { roomPath } from "@/lib/client/api";
import { scene, sceneEvents } from "@/lib/client/scene";
import { INTERESTS } from "@/lib/interests";
import type { GraphGroup, GraphUser } from "@/lib/types";
import { useSWRConfig } from "swr";
import type { MapApi } from "./SocialGraph";

const SocialGraph = dynamic(() => import("./SocialGraph"), { ssr: false });

const roomNameFrom = (path: string) => (path.startsWith("/g/") ? decodeURIComponent(path.slice(3)) : null);

/**
 * The home map. Mounted once in the (map) layout and kept alive under the room overlay,
 * so the simulation and camera survive zooming into a group and back out.
 */
export function MapScene() {
  const router = useRouter();
  const pathname = usePathname();
  const roomName = roomNameFrom(pathname);
  const { data: graph, isLoading } = useGraph();
  const { identity, me, friends } = useMe();
  const { session } = useRoomConnection();
  const { mutate } = useSWRConfig();

  const apiRef = useRef<MapApi | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const entering = useRef(false);
  const prevRoom = useRef<string | null>(roomName);
  const didInitialFit = useRef(false);
  const meId = identity?.userId ?? null;

  useEffect(() => {
    const offPause = sceneEvents.on("map-pause", () => apiRef.current?.pause());
    const offResume = sceneEvents.on("map-resume", () => apiRef.current?.resume());
    return () => {
      offPause();
      offResume();
    };
  }, []);

  const onReady = useCallback((api: MapApi) => {
    apiRef.current = api;
  }, []);

  // Initial camera: center on you (or fit the whole map), or jump straight onto the group on a direct /g/... load.
  useEffect(() => {
    if (!graph || didInitialFit.current) return;
    didInitialFit.current = true;
    const timer = setTimeout(() => {
      const api = apiRef.current;
      if (!api) return;
      const g = roomName ? graph.groups.find((x) => x.name.toLowerCase() === roomName.toLowerCase()) : null;
      if (g) {
        api.focusGroup(g.id);
        api.zoomToGroup(g.id, 0);
      } else if (!meId || !api.centerOnUser(meId, 900)) api.fitAll(900);
    }, 900);
    return () => clearTimeout(timer);
  }, [graph, roomName, meId]);

  // Coming back out of a room (Leave, scroll up, Esc, or browser back): restore the camera.
  useEffect(() => {
    const was = prevRoom.current;
    prevRoom.current = roomName;
    if (was && !roomName) {
      entering.current = false;
      const api = apiRef.current;
      api?.resume();
      api?.focusGroup(null);
      if (scene.cameraBeforeRoom) api?.setCamera(scene.cameraBeforeRoom, 800);
      else api?.fitAll(800);
      scene.cameraBeforeRoom = null;
      refreshGraph(mutate);
    }
  }, [roomName, mutate]);

  // Entering another group while one is minimized switches rooms (the connection provider handles the hand-over).
  const enterGroup = (group: { id: number; name: string }) => {
    if (entering.current) return;
    entering.current = true;
    setSelectedId(null);
    const api = apiRef.current;
    if (api) {
      scene.cameraBeforeRoom = api.getCamera();
      api.focusGroup(group.id);
      api.zoomToGroup(group.id, 600);
    }
    setTimeout(() => router.push(roomPath(group.name)), 600);
  };

  const selected = selectedId ? graph?.users.find((u) => u.id === selectedId) : undefined;
  const groupName = (id: number | null) => graph?.groups.find((g) => g.id === id)?.name ?? null;
  const onMap = !roomName;

  return (
    <>
      <div className="fixed inset-0" aria-label="Social map" role="application">
        {graph && (
          <SocialGraph
            graph={graph}
            meId={identity?.userId ?? null}
            friendIds={friends.friends}
            selectedId={onMap ? (selectedId ?? null) : null}
            cardRef={cardRef}
            onReady={onReady}
            onNodeClick={(u: GraphUser) => setSelectedId((cur) => (cur === u.id ? null : u.id))}
            onGroupClick={(g: GraphGroup) => enterGroup(g)}
            onBackgroundClick={() => setSelectedId(null)}
          />
        )}
      </div>

      <AnimatePresence>
        {isLoading && !graph && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 flex items-center justify-center"
          >
            <div className="animate-pulse font-heading text-sm tracking-[0.3em] text-muted-foreground uppercase">
              Mapping the room…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onMap && (
          <motion.header
            key="topbar"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4"
          >
            <div className="pointer-events-auto flex items-center gap-2.5">
              <OrbitLogo size={28} className="drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
              <h1 className="font-heading text-lg font-semibold tracking-tight">Orbit</h1>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {me && (
                <>
                  <Button className="glass h-9 rounded-full px-3.5 text-foreground hover:bg-white/10" variant="ghost" onClick={() => setNewGroupOpen(true)}>
                    <Plus /> <span className="hidden sm:inline">New group</span>
                  </Button>
                  <RequestsBell />
                  <button
                    onClick={() => setEditOpen(true)}
                    aria-label="Your profile"
                    className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <Avatar
                      name={me.name}
                      url={me.avatarUrl}
                      color={INTERESTS.find((i) => i.id === me.interestIds[0])?.color ?? "#60A5FA"}
                      size={36}
                    />
                  </button>
                </>
              )}
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onMap && graph && (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-x-0 bottom-5 z-10 text-center text-xs tracking-wide text-muted-foreground"
          >
            Scroll to zoom · drag to pan · click a person to meet them · click a group to step inside
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onMap && selected && (
          <ProfileCard
            key={selected.id}
            ref={cardRef}
            user={selected}
            groupName={groupName(selected.groupId)}
            onClose={() => setSelectedId(null)}
            onEditProfile={() => {
              setSelectedId(null);
              setEditOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onMap && session?.group && (
          <MinimizedRoomWidget key="mini-room" onRestore={() => session.group && enterGroup(session.group)} />
        )}
      </AnimatePresence>

      <EditProfileSheet open={editOpen} onOpenChange={setEditOpen} />
      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        onCreated={async (group) => {
          await refreshGraph(mutate);
          // give the new blob a beat to appear before flying into it
          setTimeout(() => enterGroup(group), 350);
        }}
      />
    </>
  );
}
