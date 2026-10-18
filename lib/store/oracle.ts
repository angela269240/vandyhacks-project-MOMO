import oracledb from "oracledb";
import { query, withConnection } from "../db";
import { joinNotes, notesExpiry } from "../notes";
import type { Bookmark, ChatHour, ChatMessage, Group, GroupNotes, Interest, User } from "../types";
import { buildGraph } from "./graph";
import type { Store } from "./types";

type UserRow = {
  ID: string;
  NAME: string;
  LINKEDIN: string | null;
  BIO: string | null;
  AVATAR_URL: string | null;
  CURRENT_GROUP_ID: number | null;
  IN_ROOM: number;
  LEFT_GROUP_AT: Date | null;
  INTEREST_IDS: string | null;
  MEMBER_OF: string | null;
  BOOKMARKS: string | null;
};

type GroupRow = {
  ID: number;
  NAME: string;
  COLOR: string;
  CATEGORY: string;
  CREATED_BY: string | null;
  CREATED_AT: Date;
  LAST_EXIT_AT: Date | null;
};

type ChatRow = { GROUP_ID: number; HOUR_START: Date; MESSAGES: ChatMessage[] | string };

type NotesRow = { CONTENT: string | null; VERSION: number; CREATED_AT: Date; UPDATED_AT: Date; EXPIRES_AT: Date };

const NOTES_SELECT = `SELECT content, version, created_at, updated_at, expires_at FROM group_notes WHERE group_id = :g AND expires_at > :now`;
/** ORA-00001: another request created the same room's notes row first. */
const isDuplicate = (e: unknown) => String(e).includes("ORA-00001");

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

const USER_SELECT = `
  SELECT u.id, u.name, u.linkedin, u.bio, u.avatar_url, u.current_group_id, u.in_room, u.left_group_at,
         (SELECT LISTAGG(ui.interest_id, ',') WITHIN GROUP (ORDER BY ui.interest_id)
            FROM user_interests ui WHERE ui.user_id = u.id) AS interest_ids,
         (SELECT LISTAGG(gm.group_id, ',') WITHIN GROUP (ORDER BY gm.joined_at)
            FROM group_members gm WHERE gm.user_id = u.id) AS member_of,
         JSON_SERIALIZE(u.bookmarks) AS bookmarks
    FROM users u`;

const GROUP_SELECT = `SELECT id, name, color, category, created_by, created_at, last_exit_at FROM interest_groups`;

function toUser(r: UserRow): User {
  return {
    id: r.ID,
    name: r.NAME,
    linkedin: r.LINKEDIN,
    bio: r.BIO,
    avatarUrl: r.AVATAR_URL,
    interestIds: r.INTEREST_IDS ? r.INTEREST_IDS.split(",").map(Number) : [],
    currentGroupId: r.CURRENT_GROUP_ID,
    inRoom: r.IN_ROOM === 1,
    leftGroupAt: iso(r.LEFT_GROUP_AT),
    memberOf: r.MEMBER_OF ? r.MEMBER_OF.split(",").map(Number) : [],
    bookmarks: r.BOOKMARKS ? (JSON.parse(r.BOOKMARKS) as Bookmark[]) : [],
  };
}

function toGroup(r: GroupRow): Group {
  return {
    id: r.ID,
    name: r.NAME,
    color: r.COLOR,
    category: r.CATEGORY,
    createdBy: r.CREATED_BY,
    createdAt: iso(r.CREATED_AT)!,
    lastExitAt: iso(r.LAST_EXIT_AT),
  };
}

function toNotes(r: NotesRow): GroupNotes {
  return {
    content: r.CONTENT ?? "", // Oracle stores '' as NULL
    version: r.VERSION,
    createdAt: iso(r.CREATED_AT)!,
    updatedAt: iso(r.UPDATED_AT)!,
    expiresAt: iso(r.EXPIRES_AT)!,
  };
}

/**
 * Read-modify-write of one room's notes under a row lock, so concurrent AI lines and manual saves serialize.
 * `change` gets the live notes (null if none) and returns the new content, or null to leave them alone.
 * An expired file is deleted first, so a new one starts a fresh 60-day clock.
 */
async function writeNotes(
  groupId: number,
  now: Date,
  change: (current: GroupNotes | null) => string | null,
): Promise<GroupNotes | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM group_notes WHERE group_id = :g AND expires_at <= :now`, { g: groupId, now });
        const res = await conn.execute<NotesRow>(`${NOTES_SELECT} FOR UPDATE`, { g: groupId, now });
        const current = res.rows?.[0] ? toNotes(res.rows[0]) : null;
        const content = change(current);
        if (content === null) {
          await conn.rollback();
          return null;
        }
        const binds = { g: groupId, now, content: { val: content, type: oracledb.CLOB } };
        if (current) {
          await conn.execute(
            `UPDATE group_notes SET content = :content, version = version + 1, updated_at = :now WHERE group_id = :g`,
            binds,
          );
        } else {
          await conn.execute(
            `INSERT INTO group_notes (group_id, content, version, created_at, updated_at, expires_at)
             VALUES (:g, :content, 1, :now, :now, :exp)`,
            { ...binds, exp: notesExpiry(now) },
          );
        }
        await conn.commit();
        const ts = now.toISOString();
        return current
          ? { ...current, content, version: current.version + 1, updatedAt: ts }
          : { content, version: 1, createdAt: ts, updatedAt: ts, expiresAt: notesExpiry(now).toISOString() };
      });
    } catch (e) {
      // Two first lines raced to create the row: retry once and update the winner's row instead.
      if (attempt === 0 && isDuplicate(e)) continue;
      throw e;
    }
  }
}

function toChatHour(r: ChatRow): ChatHour {
  const messages = typeof r.MESSAGES === "string" ? (JSON.parse(r.MESSAGES) as ChatMessage[]) : r.MESSAGES;
  return { hourStart: iso(r.HOUR_START)!, messages };
}

const pair = (x: string, y: string) => (x < y ? { a: x, b: y } : { a: y, b: x });

async function setInterests(conn: oracledb.Connection, userId: string, interestIds: number[]) {
  await conn.execute(`DELETE FROM user_interests WHERE user_id = :id`, { id: userId });
  if (interestIds.length) {
    await conn.executeMany(
      `INSERT INTO user_interests (user_id, interest_id) VALUES (:u, :i)`,
      interestIds.map((i) => ({ u: userId, i })),
    );
  }
}

async function markGroupEmptyIfNoneActive(conn: oracledb.Connection, groupId: number, now: Date) {
  await conn.execute(
    `UPDATE interest_groups SET last_exit_at = :now
      WHERE id = :g AND NOT EXISTS (SELECT 1 FROM users WHERE current_group_id = :g AND in_room = 1)`,
    { now, g: groupId },
  );
}

export const oracleStore: Store = {
  kind: "oracle",

  async listInterests() {
    const rows = await query<{ ID: number; NAME: string; COLOR: string }>(`SELECT id, name, color FROM interests ORDER BY id`);
    return rows.map((r): Interest => ({ id: r.ID, name: r.NAME, color: r.COLOR }));
  },

  async createUser(input, id, deviceKeyHash) {
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO users (id, device_key_hash, name, linkedin, bio, avatar_url)
         VALUES (:id, :hash, :name, :linkedin, :bio, :avatar)`,
        { id, hash: deviceKeyHash, name: input.name, linkedin: input.linkedin, bio: input.bio, avatar: input.avatarUrl ?? null },
      );
      await setInterests(conn, id, input.interestIds);
      await conn.commit();
    });
    return (await this.getUser(id))!;
  },

  async getUser(id) {
    const rows = await query<UserRow>(`${USER_SELECT} WHERE u.id = :id`, { id });
    return rows[0] ? toUser(rows[0]) : null;
  },

  async getDeviceKeyHash(id) {
    const rows = await query<{ DEVICE_KEY_HASH: string }>(`SELECT device_key_hash FROM users WHERE id = :id`, { id });
    return rows[0]?.DEVICE_KEY_HASH ?? null;
  },

  async updateUser(id, patch) {
    await withConnection(async (conn) => {
      const sets: string[] = [];
      const binds: Record<string, string | null> = { id };
      const set = (column: string, bind: string, value: string | null | undefined) => {
        if (value === undefined) return;
        sets.push(`${column} = :${bind}`);
        binds[bind] = value;
      };
      set("name", "name", patch.name);
      set("linkedin", "linkedin", patch.linkedin);
      set("bio", "bio", patch.bio);
      set("avatar_url", "avatar", patch.avatarUrl);
      if (patch.bookmarks !== undefined) {
        sets.push("bookmarks = JSON(:bookmarks)");
        binds.bookmarks = JSON.stringify(patch.bookmarks);
      }
      if (sets.length) await conn.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = :id`, binds);
      if (patch.interestIds) await setInterests(conn, id, patch.interestIds);
      await conn.commit();
    });
    return this.getUser(id);
  },

  async getGraph(now, lingerMs) {
    const [users, groups, friendships] = await Promise.all([
      query<UserRow>(USER_SELECT),
      query<GroupRow>(GROUP_SELECT),
      query<{ USER_A: string; USER_B: string }>(`SELECT user_a, user_b FROM friendships WHERE status = 'accepted'`),
    ]);
    return buildGraph(
      users.map(toUser),
      groups.map(toGroup),
      friendships.map((f) => ({ a: f.USER_A, b: f.USER_B })),
      now,
      lingerMs,
    );
  },

  async createGroup(name, color, category, createdBy) {
    try {
      const rows = await withConnection(async (conn) => {
        const res = await conn.execute(
          `INSERT INTO interest_groups (name, color, category, created_by)
           VALUES (:name, :color, :category, :byUser) RETURNING id INTO :id`,
          { name: name.trim(), color, category, byUser: createdBy, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
        );
        await conn.commit();
        return (res.outBinds as { id: number[] }).id;
      });
      const found = await query<GroupRow>(
        `${GROUP_SELECT} WHERE id = :id`,
        { id: rows[0] },
      );
      return toGroup(found[0]);
    } catch (e) {
      if ((e as { errorNum?: number }).errorNum === 1) return null; // ORA-00001 unique constraint
      throw e;
    }
  },

  async getGroupByName(name) {
    const rows = await query<GroupRow>(
      `${GROUP_SELECT} WHERE name_key = LOWER(TRIM(:name))`,
      { name },
    );
    return rows[0] ? toGroup(rows[0]) : null;
  },

  async joinGroup(userId, groupId, now) {
    return withConnection(async (conn) => {
      const prev = await conn.execute<{ CURRENT_GROUP_ID: number | null }>(
        `SELECT current_group_id FROM users WHERE id = :id FOR UPDATE`,
        { id: userId },
      );
      const fromGroupId = prev.rows?.[0]?.CURRENT_GROUP_ID ?? null;
      await conn.execute(
        `UPDATE users SET current_group_id = :g, in_room = 1, left_group_at = NULL WHERE id = :id`,
        { g: groupId, id: userId },
      );
      await conn.execute(`UPDATE interest_groups SET last_exit_at = NULL WHERE id = :g`, { g: groupId });
      await conn.execute(
        `MERGE INTO group_members t USING (SELECT :u AS u, :g AS g FROM dual) s
            ON (t.user_id = s.u AND t.group_id = s.g)
          WHEN NOT MATCHED THEN INSERT (user_id, group_id) VALUES (s.u, s.g)`,
        { u: userId, g: groupId },
      );
      if (fromGroupId !== null && fromGroupId !== groupId) {
        await conn.execute(
          `UPDATE interest_groups SET screen_sharer_id = NULL WHERE id = :g AND screen_sharer_id = :id`,
          { g: fromGroupId, id: userId },
        );
        await markGroupEmptyIfNoneActive(conn, fromGroupId, now);
      }
      const grp = await conn.execute<GroupRow>(
        `${GROUP_SELECT} WHERE id = :g`,
        { g: groupId },
      );
      await conn.commit();
      if (!grp.rows?.[0]) throw new Error("not found");
      return { group: toGroup(grp.rows[0]), fromGroupId };
    });
  },

  async leaveRoom(userId, groupId, now) {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `UPDATE users SET in_room = 0, left_group_at = :now WHERE id = :id AND current_group_id = :g AND in_room = 1`,
        { now, id: userId, g: groupId },
      );
      if (!res.rowsAffected) return false;
      await conn.execute(
        `UPDATE interest_groups SET screen_sharer_id = NULL WHERE id = :g AND screen_sharer_id = :id`,
        { g: groupId, id: userId },
      );
      await markGroupEmptyIfNoneActive(conn, groupId, now);
      await conn.commit();
      return true;
    });
  },

  async claimScreen(userId, groupId) {
    return withConnection(async (conn) => {
      // A single conditional UPDATE is the arbitration: two simultaneous claims can't both match.
      const res = await conn.execute(
        `UPDATE interest_groups g SET screen_sharer_id = :id
          WHERE g.id = :g
            AND (g.screen_sharer_id IS NULL OR g.screen_sharer_id = :id
                 OR NOT EXISTS (SELECT 1 FROM users u
                                 WHERE u.id = g.screen_sharer_id AND u.current_group_id = g.id AND u.in_room = 1))`,
        { id: userId, g: groupId },
      );
      await conn.commit();
      if (res.rowsAffected) return { granted: true, sharerId: userId };
      const row = await conn.execute<{ SCREEN_SHARER_ID: string | null }>(
        `SELECT screen_sharer_id FROM interest_groups WHERE id = :g`,
        { g: groupId },
      );
      return { granted: false, sharerId: row.rows?.[0]?.SCREEN_SHARER_ID ?? null };
    });
  },

  async releaseScreen(userId, groupId) {
    await withConnection(async (conn) => {
      await conn.execute(`UPDATE interest_groups SET screen_sharer_id = NULL WHERE id = :g AND screen_sharer_id = :id`, {
        g: groupId,
        id: userId,
      });
      await conn.commit();
    });
  },

  async appendChat(groupId, message, hourStart) {
    await withConnection(async (conn) => {
      await conn.execute(
        `MERGE INTO group_chat_hours t
         USING (SELECT :g AS g, :h AS h FROM dual) s
            ON (t.group_id = s.g AND t.hour_start = s.h)
         WHEN MATCHED THEN UPDATE SET t.messages = JSON_TRANSFORM(t.messages, APPEND '$' = JSON(:msg))
         WHEN NOT MATCHED THEN INSERT (group_id, hour_start, messages) VALUES (s.g, s.h, JSON_ARRAY(JSON(:msg)))`,
        { g: groupId, h: new Date(hourStart), msg: JSON.stringify(message) },
      );
      await conn.commit();
    });
  },

  async getChat(groupId, limitHours) {
    const rows = await query<ChatRow>(
      `SELECT * FROM (
         SELECT group_id, hour_start, JSON_SERIALIZE(messages) AS messages
           FROM group_chat_hours WHERE group_id = :g ORDER BY hour_start DESC
       ) WHERE ROWNUM <= :n ORDER BY hour_start`,
      { g: groupId, n: Math.min(limitHours, 10_000) },
    );
    return rows.map(toChatHour);
  },

  async getNotes(groupId, now) {
    const rows = await query<NotesRow>(NOTES_SELECT, { g: groupId, now });
    return rows[0] ? toNotes(rows[0]) : null;
  },

  async addNotes(groupId, lines, position, now) {
    return (await writeNotes(groupId, now, (current) => joinNotes(current?.content ?? "", lines, position)))!;
  },

  async saveNotes(groupId, content, baseVersion, now) {
    return writeNotes(groupId, now, (current) => ((current?.version ?? 0) === baseVersion ? content : null));
  },

  async expireNotes(now) {
    return withConnection(async (conn) => {
      const res = await conn.execute(`DELETE FROM group_notes WHERE expires_at <= :now`, { now });
      await conn.commit();
      return res.rowsAffected ?? 0;
    });
  },

  async expireGroups(now, lingerMs) {
    const cutoff = new Date(now.getTime() - lingerMs);
    const rows = await query<GroupRow>(
      `${GROUP_SELECT} g
        WHERE last_exit_at < :cutoff
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.current_group_id = g.id AND u.in_room = 1)`,
      { cutoff },
    );
    const expired = [];
    for (const row of rows) {
      const group = toGroup(row);
      const chat = await this.getChat(group.id, Number.MAX_SAFE_INTEGER);
      await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM interest_groups WHERE id = :g`, { g: group.id });
        await conn.commit();
      });
      expired.push({ group, chat }); // group_notes goes with it (ON DELETE CASCADE)
    }
    return expired;
  },

  async getFriendState(userId) {
    const rows = await query<{ USER_A: string; USER_B: string; STATUS: string; REQUESTED_BY: string }>(
      `SELECT user_a, user_b, status, requested_by FROM friendships WHERE user_a = :id OR user_b = :id`,
      { id: userId },
    );
    const out = { friends: [] as string[], incoming: [] as string[], outgoing: [] as string[] };
    for (const r of rows) {
      const other = r.USER_A === userId ? r.USER_B : r.USER_A;
      if (r.STATUS === "accepted") out.friends.push(other);
      else if (r.REQUESTED_BY === userId) out.outgoing.push(other);
      else out.incoming.push(other);
    }
    return out;
  },

  async requestFriend(from, to) {
    const { a, b } = pair(from, to);
    return withConnection(async (conn) => {
      const existing = await conn.execute<{ STATUS: string; REQUESTED_BY: string }>(
        `SELECT status, requested_by FROM friendships WHERE user_a = :a AND user_b = :b FOR UPDATE`,
        { a, b },
      );
      const row = existing.rows?.[0];
      let result: "pending" | "accepted" | "exists" = "exists";
      if (!row) {
        await conn.execute(`INSERT INTO friendships (user_a, user_b, requested_by) VALUES (:a, :b, :byUser)`, { a, b, byUser: from });
        result = "pending";
      } else if (row.STATUS === "pending" && row.REQUESTED_BY === to) {
        await conn.execute(`UPDATE friendships SET status = 'accepted' WHERE user_a = :a AND user_b = :b`, { a, b });
        result = "accepted";
      }
      await conn.commit();
      return result;
    });
  },

  async respondFriend(me, other, accept) {
    const { a, b } = pair(me, other);
    return withConnection(async (conn) => {
      const sql = accept
        ? `UPDATE friendships SET status = 'accepted' WHERE user_a = :a AND user_b = :b AND status = 'pending' AND requested_by = :other`
        : `DELETE FROM friendships WHERE user_a = :a AND user_b = :b AND status = 'pending' AND requested_by = :other`;
      const res = await conn.execute(sql, { a, b, other });
      await conn.commit();
      return Boolean(res.rowsAffected);
    });
  },
};
