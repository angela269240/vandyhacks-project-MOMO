import type { Bookmark, ChatHour, ChatMessage, DirectChat, FriendState, Graph, Group, GroupNotes, Interest, ProfileInput, Report, User } from "../types";

export type UserPatch = Partial<ProfileInput> & { bookmarks?: Bookmark[] };

export type JoinResult = { group: Group; fromGroupId: number | null };

export type ExpiredGroup = { group: Group; chat: ChatHour[] };

/** Where an AI note goes: scheduled events at the start of the file, topic facts at the end. */
export type NotePosition = "start" | "end";

/** A report before it's stored. `key` identifies the flagged text, so the same text is only reported once. */
export type NewReport = Omit<Report, "id" | "createdAt"> & { key: string };

/** Outcome of checking an emailed code. */
export type CodeCheck = "ok" | "wrong" | "missing";

/** Everything the API needs from persistence. Implemented by the Oracle store and the in-memory fallback. */
export interface Store {
  readonly kind: "oracle" | "memory";

  listInterests(): Promise<Interest[]>;

  /** `email` is the verified .edu address from sign-up; never returned with the user. */
  createUser(input: ProfileInput, id: string, deviceKeyHash: string, email: string | null): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getDeviceKeyHash(id: string): Promise<string | null>;
  updateUser(id: string, patch: UserPatch): Promise<User | null>;

  getGraph(now: Date, lingerMs: number): Promise<Graph>;

  /** Returns null when the (case-insensitive) name is taken. */
  createGroup(name: string, color: string, category: string, createdBy: string): Promise<Group | null>;
  getGroupByName(name: string): Promise<Group | null>;
  /** Makes the group the user's active room and adds it to their memberships. */
  joinGroup(userId: string, groupId: number, now: Date): Promise<JoinResult>;
  /** Marks the user as out of the room; they keep their group for the linger window. Returns false if they weren't in it. */
  leaveRoom(userId: string, groupId: number, now: Date): Promise<boolean>;

  /**
   * One screen share per room. Atomically takes the group's share slot if it's free, already ours,
   * or held by someone no longer in the room. Returns who holds it afterwards.
   */
  claimScreen(userId: string, groupId: number): Promise<{ granted: boolean; sharerId: string | null }>;
  /** Frees the slot if this user holds it. Leaving the room or joining another group frees it too. */
  releaseScreen(userId: string, groupId: number): Promise<void>;

  appendChat(groupId: number, message: ChatMessage, hourStart: string): Promise<void>;
  getChat(groupId: number, limitHours: number): Promise<ChatHour[]>;

  /** The room's notes, or null if there are none (or they've passed their 60-day expiry). */
  getNotes(groupId: number, now: Date): Promise<GroupNotes | null>;
  /** Adds lines at the start or end, creating the file (and starting its 60-day clock) if needed. */
  addNotes(groupId: number, lines: string[], position: NotePosition, now: Date): Promise<GroupNotes>;
  /** Replaces the file after a manual edit. Returns null if someone else saved since `baseVersion`. */
  saveNotes(groupId: number, content: string, baseVersion: number, now: Date): Promise<GroupNotes | null>;
  /** Deletes notes files past their expiry. Returns how many were removed. */
  expireNotes(now: Date): Promise<number>;

  /** Removes groups with no active members whose last exit is older than the linger window. */
  expireGroups(now: Date, lingerMs: number): Promise<ExpiredGroup[]>;

  /** Stores the hash of a one-time code for `key` (purpose + email), replacing any earlier one. */
  saveEmailCode(key: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** Checks a code. A match or the last allowed miss uses it up; expired codes count as missing. */
  checkEmailCode(key: string, codeHash: string, now: Date, maxAttempts: number): Promise<CodeCheck>;

  /** Stores new reports, skipping any whose `key` was reported before. Returns how many were added. */
  addReports(reports: NewReport[], now: Date): Promise<number>;
  /** Newest first. */
  listReports(limit: number): Promise<Report[]>;

  /** The chat between two users (either order), without messages past 60 days. Empty if they've never talked. */
  getDirectChat(a: string, b: string, now: Date): Promise<DirectChat>;
  /** Appends a message, creating the chat if needed and dropping messages past 60 days. */
  appendDirectChat(a: string, b: string, message: ChatMessage, now: Date): Promise<void>;
  /** Deletes messages past 60 days, and chats left with none. Returns how many chats were removed. */
  expireDirectChats(now: Date): Promise<number>;

  getFriendState(userId: string): Promise<FriendState>;
  requestFriend(from: string, to: string): Promise<"pending" | "accepted" | "exists">;
  respondFriend(me: string, other: string, accept: boolean): Promise<boolean>;
}
