/**
 * Creates the schema in OCI Autonomous Database.
 *   npm run db:migrate            # create tables (fails on existing ones)
 *   npm run db:migrate -- --reset # drop everything first
 *   npm run db:migrate -- --upgrade # add columns introduced after the tables were created; safe to re-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import oracledb from "oracledb";

const TABLES = ["moderation_reports", "email_codes", "friendships", "group_notes", "group_chat_hours", "group_members", "user_interests", "users", "interest_groups", "interests"];

/**
 * Additive changes for databases created from an older schema.sql.
 * ORA-01430 = column already exists, ORA-00955 = table already exists.
 */
const UPGRADES = [
  `ALTER TABLE interest_groups ADD (screen_sharer_id VARCHAR2(36))`,
  `CREATE TABLE group_notes (
     group_id    NUMBER PRIMARY KEY REFERENCES interest_groups(id) ON DELETE CASCADE,
     content     CLOB,
     version     NUMBER DEFAULT 1 NOT NULL,
     created_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
     updated_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
     expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
   )`,
  `ALTER TABLE users ADD (email VARCHAR2(254))`,
  `CREATE TABLE email_codes (
     code_key    VARCHAR2(300) PRIMARY KEY,
     code_hash   VARCHAR2(64) NOT NULL,
     attempts    NUMBER DEFAULT 0 NOT NULL,
     expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
   )`,
  `CREATE TABLE moderation_reports (
     id          VARCHAR2(36) PRIMARY KEY,
     report_key  VARCHAR2(64) NOT NULL UNIQUE,
     category    VARCHAR2(10) NOT NULL CHECK (category IN ('chat', 'note', 'username', 'group')),
     severity    VARCHAR2(6) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
     summary     VARCHAR2(200 CHAR) NOT NULL,
     reason      VARCHAR2(600 CHAR),
     excerpt     VARCHAR2(1000 CHAR),
     user_id     VARCHAR2(36),
     user_name   VARCHAR2(80 CHAR),
     group_name  VARCHAR2(60 CHAR),
     item_at     TIMESTAMP WITH TIME ZONE,
     created_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
   )`,
];

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
          if (!/ORA-0(1430|0955)/.test(String(e))) throw e;
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
