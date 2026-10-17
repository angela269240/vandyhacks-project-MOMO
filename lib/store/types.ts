import type { ChatHour, ChatMessage, FriendState, Graph, Group, Interest, ProfileInput, User } from "../types";

export type JoinResult = { group: Group; fromGroupId: number | null };

export type ExpiredGroup = { group: Group; chat: ChatHour[] };

/** Everything the API needs from persistence. Implemented by the Oracle store and the in-memory fallback. */
export interface Store {
  readonly kind: "oracle" | "memory";

  listInterests(): Promise<Interest[]>;

  createUser(input: ProfileInput, id: string, deviceKeyHash: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getDeviceKeyHash(id: string): Promise<string | null>;
  updateUser(id: string, patch: Partial<ProfileInput>): Promise<User | null>;

  getGraph(now: Date, lingerMs: number): Promise<Graph>;

  /** Returns null when the (case-insensitive) name is taken. */
  createGroup(name: string, color: string, createdBy: string): Promise<Group | null>;
  getGroupByName(name: string): Promise<Group | null>;
  joinGroup(userId: string, groupId: number, now: Date): Promise<JoinResult>;
  /** Marks the user as out of the room; they keep their group for the linger window. Returns false if they weren't in it. */
  leaveRoom(userId: string, groupId: number, now: Date): Promise<boolean>;

  appendChat(groupId: number, message: ChatMessage, hourStart: string): Promise<void>;
  getChat(groupId: number, limitHours: number): Promise<ChatHour[]>;
  listUnsummarizedHours(before: string, minMessages: number): Promise<{ groupId: number; hour: ChatHour }[]>;
  setSummary(groupId: number, hourStart: string, summary: string): Promise<void>;

  /** Removes groups with no active members whose last exit is older than the linger window. */
  expireGroups(now: Date, lingerMs: number): Promise<ExpiredGroup[]>;

  getFriendState(userId: string): Promise<FriendState>;
  requestFriend(from: string, to: string): Promise<"pending" | "accepted" | "exists">;
  respondFriend(me: string, other: string, accept: boolean): Promise<boolean>;
}
