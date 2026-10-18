"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ApiError, fetcher, loadIdentity, loadSession, saveIdentity, saveSession, type Identity } from "@/lib/client/api";
import type { FriendState, User } from "@/lib/types";

type MeContext = {
  /** false until localStorage has been read (avoids flashing the login window) */
  ready: boolean;
  /** the demo profile saved on this device, whether or not this tab has entered with it */
  identity: Identity | null;
  /** this tab has entered Orbit with `identity` */
  signedIn: boolean;
  me: User | null;
  setIdentity: (identity: Identity | null) => void;
  /** saves the identity on this device and enters Orbit with it */
  signIn: (identity: Identity) => void;
  /** ends this tab's session while keeping the saved profile available for the next login */
  signOut: () => void;
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
  const [session, setSession] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only readable after mount */
    setIdentityState(loadIdentity());
    setSession(loadSession());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setIdentity = useCallback((next: Identity | null) => {
    saveIdentity(next);
    setIdentityState(next);
    if (!next) {
      saveSession(null);
      setSession(null);
    }
  }, []);

  const signIn = useCallback((next: Identity) => {
    saveIdentity(next);
    saveSession(next.userId);
    setIdentityState(next);
    setSession(next.userId);
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const signedIn = !!identity && session === identity.userId;

  const meQuery = useSWR<User>(identity ? `/api/users/${identity.userId}` : null, fetcher, {
    onError: (e) => {
      // The server forgot us (e.g. in-memory store restarted): start over.
      if (e instanceof ApiError && e.status === 404) setIdentity(null);
    },
  });
  const friendsQuery = useSWR<FriendState>(signedIn ? `/api/friends#${identity!.userId}` : null, (key: string) =>
    fetcher<FriendState>(key.split("#")[0]),
  );

  const value = useMemo<MeContext>(
    () => ({
      ready,
      identity,
      signedIn,
      me: identity ? (meQuery.data ?? null) : null,
      setIdentity,
      signIn,
      signOut,
      refreshMe: () => meQuery.mutate(),
      setMe: (user: User) => void meQuery.mutate(user, { revalidate: false }),
      friends: friendsQuery.data ?? EMPTY_FRIENDS,
      refreshFriends: () => friendsQuery.mutate(),
    }),
    [ready, identity, signedIn, meQuery, friendsQuery, setIdentity, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMe outside MeProvider");
  return ctx;
}
