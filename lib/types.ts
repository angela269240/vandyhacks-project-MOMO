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

/** `id` is assigned by the server; messages stored before ids existed fall back to ts + userId. */
export type ChatMessage = { id?: string; ts: string; userId: string; text: string };

export type ChatHour = { hourStart: string; messages: ChatMessage[] };

/** A one-to-one chat. `key` is the unique key it's stored under (lib/dm.ts dmKey); messages oldest first. */
export type DirectChat = { key: string; messages: ChatMessage[] };

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
  | { type: "friend_accepted"; payload: { a: string; b: string } }
  // the text stays out of the lobby (everyone listens there); the recipient fetches it
  | { type: "dm"; payload: { from: string; to: string } };

/**
 * A room's shared notes file. AI notetaking puts scheduled events at the top and topic facts at the bottom,
 * one line each; anyone in the room can also edit it by hand. The whole file is deleted at `expiresAt`.
 */
export type GroupNotes = { content: string; version: number; createdAt: string; updatedAt: string; expiresAt: string };

/** Notes events carry only the version: the file can outgrow a LiveKit data packet, so clients refetch. */
export type RoomEvent =
  | { type: "chat"; payload: { hourStart: string; message: ChatMessage } }
  | { type: "notes"; payload: { version: number } };

/** What a moderation report is about: one of the four kinds of text the daily review reads. */
export type ReportCategory = "chat" | "note" | "username" | "group";

export type ReportSeverity = "low" | "medium" | "high";

/** One flagged item from the daily AI moderation review (lib/moderation). Only admins see these. */
export type Report = {
  id: string;
  category: ReportCategory;
  severity: ReportSeverity;
  /** one line for the list */
  summary: string;
  /** why the moderator flagged it */
  reason: string;
  /** the flagged text itself */
  excerpt: string;
  /** who wrote it (chat), who it names (username) or who made it (group); null when unknown */
  userId: string | null;
  userName: string | null;
  /** the room it lives in, for the link; the user's current room for a username */
  groupName: string | null;
  /** when the flagged item was written, if known */
  itemAt: string | null;
  createdAt: string;
};
