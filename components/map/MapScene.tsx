"use client";

import { Bookmark, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { AddToBookmark } from "@/components/bookmarks/AddToBookmark";
import { BookmarksPane } from "@/components/bookmarks/BookmarksPane";
import { OrbitLogo } from "@/components/brand/OrbitLogo";
import { RequestsBell } from "@/components/friends/RequestsBell";
import { NewGroupDialog } from "@/components/groups/NewGroupDialog";
import { Avatar } from "@/components/profile/Avatar";
import { EditProfileSheet } from "@/components/profile/ProfileDialogs";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { MinimizedRoomWidget } from "@/components/room/MinimizedRoomWidget";
import { useRoomConnection } from "@/components/room/RoomConnection";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Button } from "@/components/ui/button";
import { refreshGraph, useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { api, roomPath } from "@/lib/client/api";
import { buildChips, type ChipState, passesChips, passesSearch, withinDegrees } from "@/lib/client/filters";
import { scene, sceneEvents } from "@/lib/client/scene";
import { identityColor } from "@/lib/colors";
import type { Group, GraphGroup, GraphUser } from "@/lib/types";
import { DegreesSlider } from "./DegreesSlider";
import { FilterBar } from "./FilterBar";
import type { MapApi } from "./SocialGraph";

const SocialGraph = dynamic(() => import("./SocialGraph"), { ssr: false });

const roomNameFrom = (path: string) => (path.startsWith("/g/") ? decodeURIComponent(path.slice(3)) : null);

/**
 * The home map. Mounted once in the (map) layout and kept alive under the room controls:
 * zooming into a bubble *is* the room, so positions and edges stay exactly where they were.
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
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [addTo, setAddTo] = useState<{ group: GraphGroup; at: { x: number; y: number } } | null>(null);
  const [chipStates, setChipStates] = useState<Record<string, ChipState>>({});
  const [query, setQuery] = useState("");
  const [degrees, setDegrees] = useState(Infinity);
  const entering = useRef(false);
  const prevRoom = useRef<string | null>(roomName);
  const didInitialFit = useRef(false);

  const meId = identity?.userId ?? null;
  const myNode = graph?.users.find((u) => u.id === meId);
  const myGroupId = myNode?.groupId ?? null;
  const roomGroup = roomName ? graph?.groups.find((g) => g.name.toLowerCase() === roomName.toLowerCase()) : undefined;
  const roomGroupId = roomGroup?.id ?? null;
  const bookmarks = useMemo(() => me?.bookmarks ?? [], [me]);
  const chips = useMemo(() => buildChips(bookmarks), [bookmarks]);

  // ---- who and what is in focus ----
  const visibleUserIds = useMemo(
    () => (graph && meId ? withinDegrees(meId, graph.edges, degrees) : null),
    [graph, meId, degrees],
  );
  const focusedGroupIds = useMemo(() => {
    const out = new Set<number>();
    for (const g of graph?.groups ?? []) {
      if (!passesChips(g, chips, chipStates) || !passesSearch(g, query, bookmarks, graph!.users)) continue;
      if (visibleUserIds && g.id !== myGroupId) {
        const hasVisible = graph!.users.some((u) => u.groupId === g.id && visibleUserIds.has(u.id));
        if (!hasVisible) continue;
      }
      out.add(g.id);
    }
    if (roomGroupId !== null) out.add(roomGroupId);
    return out;
  }, [graph, chips, chipStates, query, bookmarks, visibleUserIds, myGroupId, roomGroupId]);

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
    scene.mapApi = api;
  }, []);

  // Initial camera: fit the focused bubbles (yours in the middle), or jump onto the room on a direct /g/... load.
  useEffect(() => {
    if (!graph || didInitialFit.current) return;
    didInitialFit.current = true;
    const fit = (ms: number) => {
      const api = apiRef.current;
      if (!api) return;
      if (roomGroupId !== null) {
        api.focusGroup(roomGroupId);
        api.zoomToGroup(roomGroupId, ms);
      } else api.fitFocused(ms);
    };
    // once quickly, then again after the bubbles have settled into their spots
    const timers = [setTimeout(() => fit(0), 600), setTimeout(() => fit(900), 2400)];
    return () => timers.forEach(clearTimeout);
  }, [graph, roomGroupId]);

  // Refit when the focus set changes (filters, bookmarks, degrees), once the layout has had a moment to move.
  const focusKey = [...focusedGroupIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!didInitialFit.current || roomName) return;
    const t = setTimeout(() => apiRef.current?.fitFocused(800), 700);
    return () => clearTimeout(t);
  }, [focusKey, roomName]);

  // Coming back out of a room: your node stays put in its bubble; the view just zooms back out.
  useEffect(() => {
    const was = prevRoom.current;
    prevRoom.current = roomName;
    if (was && !roomName) {
      entering.current = false;
      const api = apiRef.current;
      api?.resume();
      api?.focusGroup(null);
      if (scene.cameraBeforeRoom) api?.setCamera(scene.cameraBeforeRoom, 800);
      else setTimeout(() => apiRef.current?.fitFocused(900), 150);
      scene.cameraBeforeRoom = null;
      refreshGraph(mutate);
    }
  }, [roomName, mutate]);

  // Entering another group while one is minimized switches rooms (the connection provider handles the hand-over).
  const enterGroup = (group: { id: number; name: string }) => {
    if (entering.current) return;
    entering.current = true;
    setSelectedId(null);
    setAddTo(null);
    const api = apiRef.current;
    if (api) {
      scene.cameraBeforeRoom = api.getCamera();
      api.focusGroup(group.id);
      api.zoomToGroup(group.id, 600);
    }
    setTimeout(() => router.push(roomPath(group.name)), 450);
  };

  const dropOnGroup = async (group: GraphGroup) => {
    if (!identity) return;
    try {
      await api<Group>(`/api/groups/${encodeURIComponent(group.name)}/join`, { method: "POST" });
      await refreshGraph(mutate);
      toast.success(`You joined ${group.name}`, { description: "Click the bubble to step inside." });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const selected = selectedId ? graph?.users.find((u) => u.id === selectedId) : undefined;
  const groupById = (id: number | null) => graph?.groups.find((g) => g.id === id) ?? null;
  const onMap = !roomName;

  return (
    <>
      <div className="fixed inset-0" aria-label="Orbit map" role="application">
        {graph && (
          <SocialGraph
            graph={graph}
            meId={meId}
            myGroupId={myGroupId}
            friendIds={friends.friends}
            selectedId={onMap ? selectedId : null}
            focusedGroupIds={focusedGroupIds}
            visibleUserIds={visibleUserIds}
            roomGroupId={roomGroupId}
            cardRef={cardRef}
            onReady={onReady}
            onNodeClick={(u: GraphUser) => setSelectedId((cur) => (cur === u.id ? null : u.id))}
            onGroupClick={(g) => enterGroup(g)}
            onGroupDoubleClick={(g, at) => me && setAddTo({ group: g, at })}
            onBackgroundClick={() => {
              setSelectedId(null);
              if (roomName) sceneEvents.emit("exit-room");
            }}
            onDropOnGroup={dropOnGroup}
          />
        )}
      </div>

      <AnimatePresence>
        {isLoading && !graph && (
          <motion.div key="loading" exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 flex items-center justify-center">
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
            className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col items-center gap-2.5 p-3 sm:p-4"
          >
            <div className="flex w-full items-center justify-between gap-3">
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  onClick={() => setBookmarksOpen((o) => !o)}
                  aria-label="Bookmarks"
                  aria-expanded={bookmarksOpen}
                  className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
                >
                  <Bookmark className="size-[18px]" />
                </button>
                <OrbitLogo size={28} />
                <h1 className="font-heading text-lg font-semibold tracking-tight">Orbit</h1>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                {me && (
                  <>
                    <Button
                      className="glass h-9 rounded-full px-3.5 text-foreground hover:bg-foreground/10"
                      variant="ghost"
                      onClick={() => setNewGroupOpen(true)}
                    >
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
                        color={identityColor(me)}
                        size={36}
                      />
                    </button>
                  </>
                )}
                <ThemeSwitch />
              </div>
            </div>
            <FilterBar chips={chips} states={chipStates} onStates={setChipStates} query={query} onQuery={setQuery} />
          </motion.header>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {onMap && graph && (
          <motion.div
            key="degrees"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center"
          >
            <DegreesSlider value={degrees} onChange={setDegrees} disabled={!meId} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <ProfileCard
            key={selected.id}
            ref={cardRef}
            user={selected}
            groupName={groupById(selected.groupId)?.name ?? null}
            communities={selected.memberOf.map((id) => groupById(id)).filter((g): g is GraphGroup => Boolean(g))}
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

      <BookmarksPane
        open={bookmarksOpen && onMap}
        onClose={() => setBookmarksOpen(false)}
        groups={graph?.groups ?? []}
        onApply={(id) =>
          setChipStates(Object.fromEntries(chips.map((c) => [c.key, c.key === `bookmark:${id}` ? "on" : "none"])))
        }
      />
      {addTo && <AddToBookmark group={addTo.group} at={addTo.at} onClose={() => setAddTo(null)} />}

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
