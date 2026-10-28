import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, newId, now } from "../db/db";
import { getSession, recordAttempt, sessionSnapshot } from "../db/repo";
import { dropTutor, getTutor } from "../tutor/agent";
import { MODES } from "../tutor/prompt";

export const sessions = new Hono();

sessions.post("/", async (c) => {
  const { setId, model, mode } = await c.req.json<{ setId: string; model?: string; mode?: string }>();
  if (!db.query("SELECT 1 FROM sets WHERE id = ?").get(setId)) return c.json({ error: "Unknown set" }, 404);
  const id = newId();
  db.query(
    "INSERT INTO sessions (id, set_id, mode, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, setId, mode && MODES[mode] ? mode : "adaptive", model || null, now(), now());
  getTutor(id).begin();
  return c.json({ id });
});

sessions.get("/:id", (c) => {
  const snap = sessionSnapshot(c.req.param("id"));
  if (!snap) return c.notFound();
  return c.json(getTutor(snap.id).snapshot());
});

sessions.delete("/:id", (c) => {
  const id = c.req.param("id");
  dropTutor(id);
  db.query("DELETE FROM sessions WHERE id = ?").run(id);
  return c.json({ ok: true });
});

sessions.get("/:id/events", (c) => {
  const id = c.req.param("id");
  if (!getSession(id)) return c.notFound();
  const tutor = getTutor(id);
  return streamSSE(c, async (stream) => {
    let alive = true;
    const unsubscribe = tutor.subscribe((event, data) => {
      stream.writeSSE({ event, data: JSON.stringify(data ?? {}) });
    });
    stream.onAbort(() => {
      alive = false;
      unsubscribe();
    });
    await stream.writeSSE({ event: "snapshot", data: JSON.stringify(tutor.snapshot()) });
    while (alive) {
      await stream.sleep(15000);
      if (alive) await stream.writeSSE({ event: "ping", data: "{}" });
    }
  });
});

function guard(id: string) {
  const s = getSession(id);
  if (!s) return { error: "Unknown session", status: 404 as const };
  if (getTutor(id).busy) return { error: "Tutor is still thinking", status: 409 as const };
  return { s };
}

sessions.post("/:id/answer", async (c) => {
  const id = c.req.param("id");
  const g = guard(id);
  if ("error" in g) return c.json({ error: g.error }, g.status);
  const { questionId, answer } = await c.req.json<{ questionId: string; answer: string }>();
  if (g.s.current_question_id !== questionId) return c.json({ error: "That question is no longer current" }, 409);
  recordAttempt(questionId, answer);
  getTutor(id).answer(questionId, answer);
  return c.json({ ok: true });
});

sessions.post("/:id/control", async (c) => {
  const id = c.req.param("id");
  const g = guard(id);
  if ("error" in g) return c.json({ error: g.error }, g.status);
  const { kind, questionId } = await c.req.json<{ kind: "CONFUSED" | "SKIP"; questionId: string }>();
  if (kind !== "CONFUSED" && kind !== "SKIP") return c.json({ error: "Bad kind" }, 400);
  getTutor(id).control(kind, questionId);
  return c.json({ ok: true });
});

sessions.post("/:id/side", async (c) => {
  const id = c.req.param("id");
  const g = guard(id);
  if ("error" in g) return c.json({ error: g.error }, g.status);
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: "Empty question" }, 400);
  getTutor(id).side(text.trim());
  return c.json({ ok: true });
});

/** Jump to another topic; the current one is paused and can be resumed later. */
sessions.post("/:id/topic", async (c) => {
  const id = c.req.param("id");
  const g = guard(id);
  if ("error" in g) return c.json({ error: g.error }, g.status);
  const { key } = await c.req.json<{ key: string }>();
  if (!db.query("SELECT 1 FROM topics WHERE session_id = ? AND key = ?").get(id, key))
    return c.json({ error: "Unknown topic" }, 404);
  void getTutor(id).jumpTo(key);
  return c.json({ ok: true });
});

/** Re-kicks a stalled session (failed plan or turn, no open question). */
sessions.post("/:id/retry", (c) => {
  const id = c.req.param("id");
  const g = guard(id);
  if ("error" in g) return c.json({ error: g.error }, g.status);
  getTutor(id).retry();
  return c.json({ ok: true });
});

sessions.get("/meta/modes", (c) =>
  c.json(Object.values(MODES).map((m) => ({ id: m.id, label: m.label }))),
);

/** Every question with its attempts, for the summary page. */
sessions.get("/:id/report", (c) => {
  const id = c.req.param("id");
  const snap = sessionSnapshot(id);
  if (!snap) return c.notFound();
  const questions = db
    .query<any, [string]>(
      `SELECT q.id, q.topic_key, q.prompt_md, q.depth, q.type,
         (SELECT json_group_array(json_object('answer', a.answer, 'verdict', a.verdict, 'misconception', a.misconception))
            FROM attempts a WHERE a.question_id = q.id) AS attempts
       FROM questions q WHERE q.session_id = ? ORDER BY q.created_at`,
    )
    .all(id)
    .map((q) => ({
      id: q.id,
      topicKey: q.topic_key,
      promptMd: q.prompt_md,
      depth: q.depth,
      type: q.type,
      attempts: JSON.parse(q.attempts),
    }));
  return c.json({ ...snap, questions });
});
