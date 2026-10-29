export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_text TEXT,
  created_at INTEGER NOT NULL
);

-- Topic plan for a set, made once by reading all its PDFs; every session copies it.
CREATE TABLE IF NOT EXISTS set_topics (
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  pages TEXT NOT NULL,                        -- JSON [{ fileId, page }] (1-based pages)
  difficulty INTEGER,
  order_idx INTEGER NOT NULL,
  PRIMARY KEY (set_id, key)
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
  usage TEXT,                                  -- JSON SessionUsage (see tutor/usage.ts)
  flow TEXT,                                   -- 'topic' once the session uses per-topic conversations
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_pages TEXT,
  notes TEXT,
  pages TEXT,                                 -- JSON [{ fileId, page }]; null for pre-plan sessions (attach whole files)
  outcome_note TEXT,
  sdk_session_id TEXT,                        -- this topic's conversation, resumed when the student comes back
  current_question_id TEXT,                   -- open question saved when the student jumps away
  scaffold_stack TEXT,                        -- scaffold stack saved when the student jumps away
  difficulty INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | active | paused | mastered | struggled | skipped
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
  reference_md TEXT,                          -- hidden worked solution (shown only when the student reveals it)
  rubric TEXT,                                -- JSON string[] of grading criteria
  harness TEXT,                               -- test program with a STUDENT_CODE_HERE marker (see tutor/runner.ts)
  revealed INTEGER NOT NULL DEFAULT 0,        -- student viewed the reference
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT,
  verdict TEXT,
  feedback_md TEXT,
  misconception TEXT,
  test_summary TEXT,                          -- local test results sent with the answer
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
