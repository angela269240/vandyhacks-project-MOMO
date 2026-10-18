-- Orbit schema for OCI Autonomous Database (Oracle 23ai).
-- Run with `npm run db:migrate` (statements are split on lines containing only "/").

CREATE TABLE interests (
  id     NUMBER PRIMARY KEY,
  name   VARCHAR2(60) NOT NULL UNIQUE,
  color  VARCHAR2(9)  NOT NULL
)
/
CREATE TABLE interest_groups (
  id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR2(60) NOT NULL,
  name_key      VARCHAR2(60) GENERATED ALWAYS AS (LOWER(TRIM(name))) VIRTUAL,
  color         VARCHAR2(9) NOT NULL,
  category      VARCHAR2(40) DEFAULT 'Social' NOT NULL,
  created_by    VARCHAR2(36),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  last_exit_at  TIMESTAMP WITH TIME ZONE,
  -- holder of the room's single screen-share slot (Store.claimScreen); no FK, users reference groups
  screen_sharer_id VARCHAR2(36),
  CONSTRAINT uq_group_name UNIQUE (name_key)
)
/
CREATE TABLE users (
  id               VARCHAR2(36) PRIMARY KEY,
  device_key_hash  VARCHAR2(64) NOT NULL,
  name             VARCHAR2(80) NOT NULL,
  linkedin         VARCHAR2(300),
  bio              VARCHAR2(280),
  avatar_url       VARCHAR2(500),
  current_group_id NUMBER REFERENCES interest_groups(id) ON DELETE SET NULL,
  in_room          NUMBER(1) DEFAULT 0 NOT NULL,
  left_group_at    TIMESTAMP WITH TIME ZONE,
  -- [{ "id": "...", "name": "Exam season", "groupIds": [1, 4] }]
  bookmarks        JSON DEFAULT JSON('[]') NOT NULL,
  -- verified .edu address from sign-up (lib/email-codes.ts); null for seeded and pre-verification profiles
  email            VARCHAR2(254),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
)
/
-- Every community a user has joined. Their node shows in only one (users.current_group_id) at a time.
CREATE TABLE group_members (
  user_id    VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  group_id   NUMBER REFERENCES interest_groups(id) ON DELETE CASCADE,
  joined_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  PRIMARY KEY (user_id, group_id)
)
/
CREATE TABLE user_interests (
  user_id     VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  interest_id NUMBER REFERENCES interests(id),
  PRIMARY KEY (user_id, interest_id)
)
/
CREATE TABLE group_chat_hours (
  group_id    NUMBER REFERENCES interest_groups(id) ON DELETE CASCADE,
  -- LOCAL TIME ZONE: Oracle rejects TIMESTAMP WITH TIME ZONE in a primary key (ORA-02329).
  hour_start  TIMESTAMP WITH LOCAL TIME ZONE,
  messages    JSON NOT NULL,
  PRIMARY KEY (group_id, hour_start)
)
/
-- A room's shared notes file (lib/notes.ts): AI-added and hand-edited lines, deleted 60 days after it was created.
CREATE TABLE group_notes (
  group_id    NUMBER PRIMARY KEY REFERENCES interest_groups(id) ON DELETE CASCADE,
  content     CLOB,
  version     NUMBER DEFAULT 1 NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
)
/
CREATE TABLE friendships (
  user_a       VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  user_b       VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  requested_by VARCHAR2(36) NOT NULL,
  status       VARCHAR2(10) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT ck_friend_order CHECK (user_a < user_b)
)
/
-- One-time codes emailed for .edu sign-up and admin sign-in. Only the code's HMAC is kept.
CREATE TABLE email_codes (
  code_key    VARCHAR2(300) PRIMARY KEY,
  code_hash   VARCHAR2(64) NOT NULL,
  attempts    NUMBER DEFAULT 0 NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
)
/
-- Flags from the daily AI moderation review (lib/moderation.ts), shown on /admin.
-- report_key hashes the flagged text, so the same text is reported once however many days it's reviewed.
CREATE TABLE moderation_reports (
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
)
/
