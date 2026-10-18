/**
 * Creates the schema in OCI Autonomous Database.
 *   npm run db:migrate            # create tables (fails on existing ones)
 *   npm run db:migrate -- --reset # drop everything first
 *   npm run db:migrate -- --upgrade # add columns introduced after the tables were created; safe to re-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import oracledb from "oracledb";

const TABLES = ["friendships", "group_chat_hours", "user_interests", "users", "interest_groups", "interests"];

/** Additive changes for databases created from an older schema.sql. ORA-01430 = column already exists. */
const UPGRADES = [`ALTER TABLE interest_groups ADD (screen_sharer_id VARCHAR2(36))`];

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  try {
    if (process.argv.includes("--upgrade")) {
      for (const stmt of UPGRADES) {
        try {
          await conn.execute(stmt);
          console.log(`ok: ${stmt}`);
        } catch (e) {
          if (!String(e).includes("ORA-01430")) throw e;
          console.log(`already applied: ${stmt}`);
        }
      }
      return;
    }
    if (process.argv.includes("--reset")) {
      for (const t of TABLES) {
        try {
          await conn.execute(`DROP TABLE ${t} CASCADE CONSTRAINTS PURGE`);
          console.log(`dropped ${t}`);
        } catch {
          // didn't exist
        }
      }
    }
    const sql = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");
    const statements = sql
      .split(/^\/\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await conn.execute(stmt);
      console.log(`ok: ${stmt.split("\n")[0]}`);
    }
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
