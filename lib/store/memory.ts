import { INTERESTS } from "../interests";
import { buildSeedWorld } from "../seed-data";
import type { ChatHour, ChatMessage, Group, ProfileInput, User } from "../types";
import { buildGraph } from "./graph";
import type { Store } from "./types";

type Friendship = { a: string; b: string; status: "pending" | "accepted"; requestedBy: string };

type State = {
  users: Map<string, User & { deviceKeyHash: string }>;
  groups: Map<number, Group>;
  friendships: Map<string, Friendship>;
  chat: Map<string, ChatHour & { groupId: number }>;
  nextGroupId: number;
};

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const chatKey = (groupId: number, hour: string) => `${groupId}|${hour}`;

function seededState(): State {
  const now = new Date();
  const world = buildSeedWorld(now);
  const state: State = { users: new Map(), groups: new Map(), friendships: new Map(), chat: new Map(), nextGroupId: 1 };

  world.groups.forEach((g) => {
    const id = state.nextGroupId++;
    state.groups.set(id, {
      id,
      name: g.name,
      color: g.color,
      createdBy: world.users[g.createdByIndex].id,
      createdAt: now.toISOString(),
      lastExitAt: null,
    });
  });
  for (const u of world.users) {
    state.users.set(u.id, {
      id: u.id,
      name: u.name,
      linkedin: u.linkedin,
      bio: u.bio,
      avatarUrl: null,
      interestIds: u.interestIds,
      currentGroupId: u.groupIndex === null ? null : u.groupIndex + 1,
      inRoom: u.inRoom,
      leftGroupAt: u.leftMinutesAgo === null ? null : new Date(now.getTime() - u.leftMinutesAgo * 60_000).toISOString(),
      deviceKeyHash: "seed",
    });
  }
  for (const f of world.friendships) state.friendships.set(pairKey(f.a, f.b), f);
  for (const c of world.chats) {
    const groupId = c.groupIndex + 1;
    state.chat.set(chatKey(groupId, c.hourStart), { groupId, hourStart: c.hourStart, messages: c.messages, summary: c.summary });
  }
  return state;
}

// Survive Next.js dev hot reloads: one world per server process.
const g = globalThis as unknown as { __socialMapperMemory?: State };
const state = () => (g.__socialMapperMemory ??= seededState());

function publicUser(u: User & { deviceKeyHash: string }): User {
  const { deviceKeyHash, ...rest } = u;
  void deviceKeyHash;
  return { ...rest, interestIds: [...u.interestIds] };
}

function activeCount(groupId: number) {
  let n = 0;
  for (const u of state().users.values()) if (u.currentGroupId === groupId && u.inRoom) n++;
  return n;
}

export const memoryStore: Store = {
  kind: "memory",

  async listInterests() {
    return INTERESTS;
  },

  async createUser(input: ProfileInput, id: string, deviceKeyHash: string) {
    const user = {
      id,
      name: input.name,
      linkedin: input.linkedin,
      bio: input.bio,
      avatarUrl: input.avatarUrl ?? null,
      interestIds: input.interestIds,
      currentGroupId: null,
      inRoom: false,
      leftGroupAt: null,
      deviceKeyHash,
    };
    state().users.set(id, user);
    return publicUser(user);
  },

  async getUser(id) {
    const u = state().users.get(id);
    return u ? publicUser(u) : null;
  },

  async getDeviceKeyHash(id) {
    return state().users.get(id)?.deviceKeyHash ?? null;
  },

  async updateUser(id, patch) {
    const u = state().users.get(id);
    if (!u) return null;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.linkedin !== undefined) u.linkedin = patch.linkedin;
    if (patch.bio !== undefined) u.bio = patch.bio;
    if (patch.interestIds !== undefined) u.interestIds = patch.interestIds;
    if (patch.avatarUrl !== undefined) u.avatarUrl = patch.avatarUrl;
    return publicUser(u);
  },

  async getGraph(now, lingerMs) {
    const s = state();
    const friendships = [...s.friendships.values()].filter((f) => f.status === "accepted");
    return buildGraph([...s.users.values()].map(publicUser), [...s.groups.values()], friendships, now, lingerMs);
  },

  async createGroup(name, color, createdBy) {
    const s = state();
    const key = name.trim().toLowerCase();
    for (const grp of s.groups.values()) if (grp.name.trim().toLowerCase() === key) return null;
    const id = s.nextGroupId++;
    const group: Group = { id, name: name.trim(), color, createdBy, createdAt: new Date().toISOString(), lastExitAt: null };
    s.groups.set(id, group);
    return group;
  },

  async getGroupByName(name) {
    const key = name.trim().toLowerCase();
    for (const grp of state().groups.values()) if (grp.name.trim().toLowerCase() === key) return grp;
    return null;
  },

  async joinGroup(userId, groupId, now) {
    const s = state();
    const u = s.users.get(userId);
    const group = s.groups.get(groupId);
    if (!u || !group) throw new Error("not found");
    const fromGroupId = u.currentGroupId;
    u.currentGroupId = groupId;
    u.inRoom = true;
    u.leftGroupAt = null;
    group.lastExitAt = null;
    if (fromGroupId !== null && fromGroupId !== groupId && activeCount(fromGroupId) === 0) {
      const from = s.groups.get(fromGroupId);
      if (from) from.lastExitAt = now.toISOString();
    }
    return { group, fromGroupId };
  },

  async leaveRoom(userId, groupId, now) {
    const s = state();
    const u = s.users.get(userId);
    if (!u || u.currentGroupId !== groupId || !u.inRoom) return false;
    u.inRoom = false;
    u.leftGroupAt = now.toISOString();
    if (activeCount(groupId) === 0) {
      const grp = s.groups.get(groupId);
      if (grp) grp.lastExitAt = now.toISOString();
    }
    return true;
  },

  async appendChat(groupId, message: ChatMessage, hourStart) {
    const s = state();
    const key = chatKey(groupId, hourStart);
    const bucket = s.chat.get(key);
    if (bucket) bucket.messages.push(message);
    else s.chat.set(key, { groupId, hourStart, messages: [message], summary: null });
  },

  async getChat(groupId, limitHours) {
    return [...state().chat.values()]
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => a.hourStart.localeCompare(b.hourStart))
      .slice(-limitHours)
      .map(({ hourStart, messages, summary }) => ({ hourStart, messages: [...messages], summary }));
  },

  async listUnsummarizedHours(before, minMessages) {
    return [...state().chat.values()]
      .filter((c) => c.summary === null && c.hourStart < before && c.messages.length >= minMessages)
      .map(({ groupId, hourStart, messages, summary }) => ({ groupId, hour: { hourStart, messages, summary } }));
  },

  async setSummary(groupId, hourStart, summary) {
    const bucket = state().chat.get(chatKey(groupId, hourStart));
    if (bucket) bucket.summary = summary;
  },

  async expireGroups(now, lingerMs) {
    const s = state();
    const cutoff = now.getTime() - lingerMs;
    const expired = [];
    for (const grp of [...s.groups.values()]) {
      if (activeCount(grp.id) > 0 || !grp.lastExitAt || new Date(grp.lastExitAt).getTime() > cutoff) continue;
      const chat = await this.getChat(grp.id, Number.MAX_SAFE_INTEGER);
      s.groups.delete(grp.id);
      for (const [k, c] of s.chat) if (c.groupId === grp.id) s.chat.delete(k);
      for (const u of s.users.values()) if (u.currentGroupId === grp.id) u.currentGroupId = null;
      expired.push({ group: grp, chat });
    }
    return expired;
  },

  async getFriendState(userId) {
    const out = { friends: [] as string[], incoming: [] as string[], outgoing: [] as string[] };
    for (const f of state().friendships.values()) {
      if (f.a !== userId && f.b !== userId) continue;
      const other = f.a === userId ? f.b : f.a;
      if (f.status === "accepted") out.friends.push(other);
      else if (f.requestedBy === userId) out.outgoing.push(other);
      else out.incoming.push(other);
    }
    return out;
  },

  async requestFriend(from, to) {
    const s = state();
    const key = pairKey(from, to);
    const existing = s.friendships.get(key);
    if (!existing) {
      const [a, b] = from < to ? [from, to] : [to, from];
      s.friendships.set(key, { a, b, status: "pending", requestedBy: from });
      return "pending";
    }
    // They already asked me: requesting back accepts it.
    if (existing.status === "pending" && existing.requestedBy === to) {
      existing.status = "accepted";
      return "accepted";
    }
    return "exists";
  },

  async respondFriend(me, other, accept) {
    const s = state();
    const key = pairKey(me, other);
    const f = s.friendships.get(key);
    if (!f || f.status !== "pending" || f.requestedBy !== other) return false;
    if (accept) f.status = "accepted";
    else s.friendships.delete(key);
    return true;
  },
};
