import type { Bookmark, ChatHour, ChatMessage, FriendState, Graph, Group, GroupNotes, Interest, ProfileInput, User } from "../types";

export type UserPatch = Partial<ProfileInput> & { bookmarks?: Bookmark[] };

export type JoinResult = { group: Group; fromGroupId: number | null };

export type ExpiredGroup = { group: Group; chat: ChatHour[] };

/** Where an AI note goes: scheduled events at the start of the file, topic facts at the end. */
export type NotePosition = "start" | "end";

/** Everything the API needs from persistence. Implemented by the Oracle store and the in-memory fallback. */
export interface Store {
  readonly kind: "oracle" | "memory";

  listInterests(): Promise<Interest[]>;

  createUser(input: ProfileInput, id: string, deviceKeyHash: string): Promise<User>;
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

  getFriendState(userId: string): Promise<FriendState>;
  requestFriend(from: string, to: string): Promise<"pending" | "accepted" | "exists">;
  respondFriend(me: string, other: string, accept: boolean): Promise<boolean>;
}
