export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'adaptive',
  model TEXT,
  sdk_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | finished
  current_topic TEXT,
  current_question_id TEXT,
  scaffold_stack TEXT NOT NULL DEFAULT '[]',  -- JSON array of question ids waiting to be re-asked
  summary_md TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_pages TEXT,
  difficulty INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | active | mastered | struggled | skipped
  order_idx INTEGER NOT NULL,
  PRIMARY KEY (session_id, key)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  prompt_md TEXT NOT NULL,
  type TEXT NOT NULL,
  choices TEXT,
  language TEXT,
  difficulty INTEGER,
  depth INTEGER NOT NULL DEFAULT 0,
  parent_question_id TEXT,
  source_ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT,
  verdict TEXT,
  feedback_md TEXT,
  misconception TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,        -- user | tutor
  kind TEXT NOT NULL,        -- side | note
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;
