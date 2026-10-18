/**
 * Seeds OCI Autonomous Database with the 20 interests and the demo world (same data the in-memory store uses).
 *   npm run db:seed
 * Re-running clears seeded rows first; user-created profiles and groups are left alone.
 */
import oracledb from "oracledb";
import { INTERESTS } from "../lib/interests";
import { buildSeedWorld, SEED_GROUPS } from "../lib/seed-data";

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const now = new Date();
  const world = buildSeedWorld(now);
  try {
    await conn.execute(`DELETE FROM users WHERE id LIKE 'seed-%'`);
    await conn.executeMany(
      `DELETE FROM interest_groups WHERE name_key = LOWER(TRIM(:name))`,
      SEED_GROUPS.map((g) => ({ name: g.name })),
    );

    await conn.executeMany(
      `MERGE INTO interests t USING (SELECT :id id, :name name, :color color FROM dual) s ON (t.id = s.id)
       WHEN MATCHED THEN UPDATE SET t.name = s.name, t.color = s.color
       WHEN NOT MATCHED THEN INSERT (id, name, color) VALUES (s.id, s.name, s.color)`,
      INTERESTS.map((i) => ({ id: i.id, name: i.name, color: i.color })),
    );

    // Users first without a group (groups reference their creator loosely, users reference groups).
    await conn.executeMany(
      `INSERT INTO users (id, device_key_hash, name, linkedin, bio) VALUES (:id, 'seed', :name, :linkedin, :bio)`,
      world.users.map((u) => ({ id: u.id, name: u.name, linkedin: u.linkedin, bio: u.bio })),
    );
    await conn.executeMany(
      `INSERT INTO user_interests (user_id, interest_id) VALUES (:u, :i)`,
      world.users.flatMap((u) => u.interestIds.map((i) => ({ u: u.id, i }))),
    );

    const groupIds: number[] = [];
    for (const g of world.groups) {
      const res = await conn.execute(
        `INSERT INTO interest_groups (name, color, category, created_by) VALUES (:name, :color, :category, :byUser) RETURNING id INTO :id`,
        {
          name: g.name,
          color: g.color,
          category: g.category,
          byUser: world.users[g.createdByIndex].id,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
      );
      groupIds.push((res.outBinds as { id: number[] }).id[0]);
    }

    for (const u of world.users) {
      if (u.groupIndex === null) continue;
      await conn.execute(
        `UPDATE users SET current_group_id = :g, in_room = :inRoom, left_group_at = :left WHERE id = :id`,
        {
          g: groupIds[u.groupIndex],
          inRoom: u.inRoom ? 1 : 0,
          left: u.leftMinutesAgo === null ? null : new Date(now.getTime() - u.leftMinutesAgo * 60_000),
          id: u.id,
        },
      );
    }

    await conn.executeMany(
      `INSERT INTO group_members (user_id, group_id) VALUES (:u, :g)`,
      world.users.flatMap((u) => u.memberOf.map((i) => ({ u: u.id, g: groupIds[i] }))),
    );

    await conn.executeMany(
      `INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES (:a, :b, :byUser, :status)`,
      world.friendships.map((f) => ({ a: f.a, b: f.b, byUser: f.requestedBy, status: f.status })),
    );

    for (const c of world.chats) {
      await conn.execute(
        `INSERT INTO group_chat_hours (group_id, hour_start, messages) VALUES (:g, :h, JSON(:m))`,
        { g: groupIds[c.groupIndex], h: new Date(c.hourStart), m: JSON.stringify(c.messages) },
      );
    }

    await conn.commit();
    console.log(
      `Seeded ${INTERESTS.length} interests, ${world.users.length} users, ${world.groups.length} groups, ` +
        `${world.friendships.length} friendships, ${world.chats.length} chat hours.`,
    );
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
