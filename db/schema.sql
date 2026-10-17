-- Social Mapper schema for OCI Autonomous Database (Oracle 23ai).
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
  created_by    VARCHAR2(36),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  last_exit_at  TIMESTAMP WITH TIME ZONE,
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
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
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
  hour_start  TIMESTAMP WITH TIME ZONE,
  messages    JSON NOT NULL,
  summary     VARCHAR2(1000),
  PRIMARY KEY (group_id, hour_start)
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
