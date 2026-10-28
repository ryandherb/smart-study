import { db, newId, now } from "./db";

export type Verdict = "correct" | "partial" | "incorrect";

export interface SessionRow {
  id: string;
  set_id: string;
  mode: string;
  model: string | null;
  provider: "claude" | "chatgpt";
  sdk_session_id: string | null;
  status: string;
  current_topic: string | null;
  current_question_id: string | null;
  scaffold_stack: string;
  summary_md: string | null;
  usage: string | null;
  flow: string | null;
  created_at: number;
  updated_at: number;
}

export interface QuestionRow {
  id: string;
  session_id: string;
  topic_key: string;
  prompt_md: string;
  type: string;
  choices: string | null;
  language: string | null;
  difficulty: number | null;
  depth: number;
  parent_question_id: string | null;
  source_ref: string | null;
  reference_md: string | null;
  rubric: string | null;
  harness: string | null;
  revealed: number;
  created_at: number;
}

export const getSession = (id: string) =>
  db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);

export function updateSession(id: string, fields: Partial<SessionRow>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = $${k}`).join(", ");
  const params: Record<string, any> = { $id: id, $updated_at: now() };
  for (const k of keys) params[`$${k}`] = (fields as any)[k];
  db.query(`UPDATE sessions SET ${sets}, updated_at = $updated_at WHERE id = $id`).run(params);
}

export const getStack = (s: SessionRow): string[] => JSON.parse(s.scaffold_stack);

export const getQuestion = (id: string) =>
  db.query<QuestionRow, [string]>("SELECT * FROM questions WHERE id = ?").get(id);

export const listTopics = (sessionId: string) =>
  db
    .query<any, [string]>("SELECT * FROM topics WHERE session_id = ? ORDER BY order_idx")
    .all(sessionId);

export function setTopicStatus(sessionId: string, key: string, status: string) {
  db.query("UPDATE topics SET status = ? WHERE session_id = ? AND key = ?").run(status, sessionId, key);
}

export function recordAttempt(questionId: string, answer: string, testSummary: string | null = null) {
  const id = newId();
  db.query("INSERT INTO attempts (id, question_id, answer, test_summary, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    questionId,
    answer,
    testSummary,
    now(),
  );
  return id;
}

/** Grades the most recent ungraded attempt on a question (or creates one if none exists). */
export function gradeLatestAttempt(
  questionId: string,
  verdict: Verdict,
  feedback: string,
  misconception?: string,
) {
  const row = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM attempts WHERE question_id = ? AND verdict IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get(questionId);
  const id = row?.id ?? recordAttempt(questionId, "");
  db.query("UPDATE attempts SET verdict = ?, feedback_md = ?, misconception = ? WHERE id = ?").run(
    verdict,
    feedback,
    misconception ?? null,
    id,
  );
  return id;
}

export function addMessage(sessionId: string, role: "user" | "tutor", kind: string, text: string) {
  db.query("INSERT INTO messages (session_id, role, kind, text, created_at) VALUES (?, ?, ?, ?, ?)").run(
    sessionId,
    role,
    kind,
    text,
    now(),
  );
}

export function questionView(q: QuestionRow) {
  return {
    id: q.id,
    topicKey: q.topic_key,
    promptMd: q.prompt_md,
    type: q.type,
    choices: q.choices ? JSON.parse(q.choices) : null,
    language: q.language,
    difficulty: q.difficulty,
    depth: q.depth,
    parentQuestionId: q.parent_question_id,
    sourceRef: q.source_ref ? JSON.parse(q.source_ref) : null,
    // Only flags: the reference and tests themselves stay on the server until revealed.
    hasTests: !!q.harness,
    hasReference: !!q.reference_md,
  };
}

/** Full snapshot the UI renders from; also sent after every state change. */
export function sessionSnapshot(sessionId: string) {
  const s = getSession(sessionId);
  if (!s) return null;
  const fileNames = new Map(
    db.query<{ id: string; name: string }, [string]>("SELECT id, name FROM files WHERE set_id = ?").all(s.set_id).map((f) => [f.id, f.name]),
  );
  const describePages = (pages: string | null) =>
    pages
      ? (JSON.parse(pages) as { fileId: string; page: number }[]).map((p) => `${fileNames.get(p.fileId)} p.${p.page}`).join(", ")
      : null;
  const topics = listTopics(sessionId).map((t) => ({
    key: t.key,
    title: t.title,
    sourcePages: describePages(t.pages) ?? t.source_pages,
    difficulty: t.difficulty,
    status: t.status,
  }));
  const stack = getStack(s)
    .map(getQuestion)
    .filter(Boolean)
    .map((q) => questionView(q!));
  const current = s.current_question_id ? getQuestion(s.current_question_id) : null;
  const lastAttempt = current
    ? db
        .query<any, [string]>(
          "SELECT * FROM attempts WHERE question_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(current.id)
    : null;
  const files = db
    .query<any, [string]>("SELECT id, name FROM files WHERE set_id = ?")
    .all(s.set_id);
  const set = db.query<any, [string]>("SELECT id, title FROM sets WHERE id = ?").get(s.set_id);
  const messages = db
    .query<any, [string]>("SELECT role, kind, text, created_at FROM messages WHERE session_id = ? ORDER BY id")
    .all(sessionId);
  return {
    id: s.id,
    set,
    files,
    mode: s.mode,
    model: s.model,
    provider: s.provider,
    status: s.status,
    currentTopic: s.current_topic,
    topics,
    stack,
    current: current ? questionView(current) : null,
    lastAttempt: lastAttempt
      ? {
          answer: lastAttempt.answer,
          verdict: lastAttempt.verdict,
          feedbackMd: lastAttempt.feedback_md,
          misconception: lastAttempt.misconception,
        }
      : null,
    summaryMd: s.summary_md,
    messages,
  };
}

/** Compact state line appended to each student message so the tutor stays on track. */
export function stateLine(sessionId: string) {
  const s = getSession(sessionId)!;
  const topics = listTopics(sessionId);
  const idx = topics.findIndex((t) => t.key === s.current_topic);
  const stack = getStack(s);
  const parts = [
    `topic=${s.current_topic ?? "none"} (${idx + 1}/${topics.length})`,
    `current_question_id=${s.current_question_id ?? "none"}`,
    `scaffold_depth=${stack.length}`,
  ];
  if (stack.length) parts.push(`originals_waiting=[${stack.join(", ")}]`);
  const pending = topics.filter((t) => t.status === "pending").map((t) => t.key);
  parts.push(`pending_topics=[${pending.join(", ")}]`);
  return `[app state: ${parts.join("; ")}]`;
}
