-- Users and sessions -------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  display_name  TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Refresh tokens are stored HASHED, never in the clear. If this table leaks, the
-- rows in it are not usable as credentials.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens (expires_at);

-- Learning content ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS k8s_objects (
  id              TEXT PRIMARY KEY,
  kind            TEXT    NOT NULL,
  api_version     TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  short_names     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  namespaced      BOOLEAN NOT NULL,
  summary         TEXT    NOT NULL,
  explanation     TEXT    NOT NULL,
  when_to_use     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  key_fields      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  example         TEXT    NOT NULL,
  related_ids     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes JSONB   NOT NULL DEFAULT '[]'::jsonb,
  kubectl_tips    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  -- A generated tsvector: Postgres keeps it in sync on every write, so search can
  -- never drift out of date with the row it describes.
  search_vec      TSVECTOR GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', kind), 'A') ||
                    setweight(to_tsvector('english', id), 'A') ||
                    setweight(to_tsvector('english', summary), 'B') ||
                    setweight(to_tsvector('english', explanation), 'C')
                  ) STORED
);
CREATE INDEX IF NOT EXISTS k8s_objects_search_idx   ON k8s_objects USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS k8s_objects_category_idx ON k8s_objects (category);

CREATE TABLE IF NOT EXISTS kubectl_commands (
  id          TEXT PRIMARY KEY,
  category    TEXT    NOT NULL,
  command     TEXT    NOT NULL,
  description TEXT    NOT NULL,
  example     TEXT,
  notes       TEXT,
  danger      BOOLEAN NOT NULL DEFAULT false,
  tags        JSONB   NOT NULL DEFAULT '[]'::jsonb,
  search_vec  TSVECTOR GENERATED ALWAYS AS (
                setweight(to_tsvector('english', command), 'A') ||
                setweight(to_tsvector('english', description), 'B') ||
                setweight(to_tsvector('english', coalesce(notes, '')), 'C')
              ) STORED
);
CREATE INDEX IF NOT EXISTS kubectl_commands_search_idx   ON kubectl_commands USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS kubectl_commands_category_idx ON kubectl_commands (category);

-- Per-user learning state --------------------------------------------------

CREATE TABLE IF NOT EXISTS user_progress (
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT        NOT NULL CHECK (item_type IN ('object', 'command')),
  item_id    TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'learned' CHECK (status IN ('learning', 'learned')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS user_progress_user_idx ON user_progress (user_id);

CREATE TABLE IF NOT EXISTS user_notes (
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT        NOT NULL CHECK (item_type IN ('object', 'command')),
  item_id    TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);
