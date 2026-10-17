"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ApiError, fetcher, loadIdentity, saveIdentity, type Identity } from "@/lib/client/api";
import type { FriendState, User } from "@/lib/types";

type MeContext = {
  /** false until localStorage has been read (avoids flashing the create-profile dialog) */
  ready: boolean;
  identity: Identity | null;
  me: User | null;
  setIdentity: (identity: Identity | null) => void;
  refreshMe: () => Promise<unknown>;
  /** optimistic local update of my profile (e.g. bookmarks) */
  setMe: (user: User) => void;
  friends: FriendState;
  refreshFriends: () => Promise<unknown>;
};

const EMPTY_FRIENDS: FriendState = { friends: [], incoming: [], outgoing: [] };
const Ctx = createContext<MeContext | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [identity, setIdentityState] = useState<Identity | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setIdentityState(loadIdentity());
    setReady(true);
  }, []);

  const setIdentity = useCallback((next: Identity | null) => {
    saveIdentity(next);
    setIdentityState(next);
  }, []);

  const meQuery = useSWR<User>(identity ? `/api/users/${identity.userId}` : null, fetcher, {
    onError: (e) => {
      // The server forgot us (e.g. in-memory store restarted): start over.
      if (e instanceof ApiError && e.status === 404) setIdentity(null);
    },
  });
  const friendsQuery = useSWR<FriendState>(identity ? `/api/friends#${identity.userId}` : null, (key: string) =>
    fetcher<FriendState>(key.split("#")[0]),
  );

  const value = useMemo<MeContext>(
    () => ({
      ready,
      identity,
      me: identity ? (meQuery.data ?? null) : null,
      setIdentity,
      refreshMe: () => meQuery.mutate(),
      setMe: (user: User) => void meQuery.mutate(user, { revalidate: false }),
      friends: friendsQuery.data ?? EMPTY_FRIENDS,
      refreshFriends: () => friendsQuery.mutate(),
    }),
    [ready, identity, meQuery, friendsQuery, setIdentity],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMe outside MeProvider");
  return ctx;
}
