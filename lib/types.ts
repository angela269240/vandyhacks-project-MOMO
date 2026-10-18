export type Interest = { id: number; name: string; color: string };

export type Bookmark = { id: string; name: string; groupIds: number[] };

export type User = {
  id: string;
  name: string;
  linkedin: string | null;
  bio: string | null;
  avatarUrl: string | null;
  interestIds: number[];
  currentGroupId: number | null;
  inRoom: boolean;
  leftGroupAt: string | null;
  /** every community they've joined; their node shows in only one (currentGroupId) at a time */
  memberOf: number[];
  /** only returned to the owner */
  bookmarks?: Bookmark[];
};

export type Group = {
  id: number;
  name: string;
  color: string;
  category: string;
  createdBy: string | null;
  createdAt: string;
  lastExitAt: string | null;
};

/** A user as shown on the map: placed in a group only while active or within the 24h "away" window. */
export type GraphUser = Omit<User, "currentGroupId" | "inRoom" | "leftGroupAt" | "bookmarks"> & {
  groupId: number | null;
  inRoom: boolean;
  away: boolean;
};

export type GraphGroup = Group & { activeCount: number; memberCount: number };

export type Edge = { source: string; target: string };

export type Graph = { users: GraphUser[]; groups: GraphGroup[]; edges: Edge[] };

export type ChatMessage = { ts: string; userId: string; text: string };

export type ChatHour = { hourStart: string; messages: ChatMessage[] };

export type FriendState = { friends: string[]; incoming: string[]; outgoing: string[] };

export type ProfileInput = {
  name: string;
  linkedin: string | null;
  bio: string | null;
  interestIds: number[];
  avatarUrl?: string | null;
};

/** Events pushed to the lobby (home map) and to group channels. */
export type LobbyEvent =
  | { type: "user_created"; payload: { userId: string } }
  | { type: "user_updated"; payload: { userId: string } }
  | { type: "user_moved"; payload: { userId: string; groupId: number; fromGroupId: number | null } }
  | { type: "user_left_room"; payload: { userId: string; groupId: number } }
  | { type: "group_created"; payload: { groupId: number } }
  | { type: "group_expired"; payload: { groupId: number } }
  | { type: "friend_requested"; payload: { from: string; to: string } }
  | { type: "friend_accepted"; payload: { a: string; b: string } };

export type RoomEvent = { type: "chat"; payload: { hourStart: string; message: ChatMessage } };
