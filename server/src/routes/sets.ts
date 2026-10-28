import { Hono } from "hono";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, db, newId, now } from "../db/db";

export const sets = new Hono();

const MAX_PDF_BYTES = 30 * 1024 * 1024;

sets.get("/", (c) => {
  const rows = db
    .query<any, []>(
      `SELECT s.id, s.title, s.created_at,
        (SELECT COALESCE(SUM(elapsed_ms), 0) FROM study_time WHERE set_id = s.id) AS study_time_ms,
        (SELECT COUNT(*) FROM files f WHERE f.set_id = s.id) AS file_count,
        (SELECT json_group_array(name) FROM files f WHERE f.set_id = s.id) AS file_names
       FROM sets s ORDER BY s.created_at DESC`,
    )
    .all();
  const stats = db.query<any, [string]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN t.status = 'mastered' THEN 1 ELSE 0 END) AS mastered,
       SUM(CASE WHEN t.status = 'struggled' THEN 1 ELSE 0 END) AS struggled
     FROM topics t JOIN sessions se ON se.id = t.session_id
     WHERE se.id = (SELECT id FROM sessions WHERE set_id = ? ORDER BY updated_at DESC LIMIT 1)`,
  );
  const sessions = db.query<any, [string]>(
    "SELECT id, status, created_at, updated_at, provider, model FROM sessions WHERE set_id = ? ORDER BY updated_at DESC",
  );
  return c.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      studyTimeMs: r.study_time_ms,
      files: JSON.parse(r.file_names),
      latest: stats.get(r.id),
      sessions: sessions.all(r.id),
    })),
  );
});

// Each browser tracker reports a cumulative total, so retries cannot count time twice.
sets.post("/:id/time", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.trackerId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.trackerId)
    || !Number.isSafeInteger(body.elapsedMs) || body.elapsedMs < 0) {
    return c.json({ error: "Invalid study time" }, 400);
  }
  if (!db.query("SELECT 1 FROM sets WHERE id = ?").get(id)) return c.json({ error: "Unknown set" }, 404);
  db.query(`INSERT INTO study_time (set_id, tracker_id, elapsed_ms) VALUES (?, ?, ?)
    ON CONFLICT (set_id, tracker_id) DO UPDATE SET elapsed_ms = MAX(elapsed_ms, excluded.elapsed_ms)`)
    .run(id, body.trackerId, body.elapsedMs);
  const total = db.query<{ studyTimeMs: number }, [string]>(
    "SELECT COALESCE(SUM(elapsed_ms), 0) AS studyTimeMs FROM study_time WHERE set_id = ?",
  ).get(id)!;
  return c.json(total);
});

sets.post("/", async (c) => {
  const form = await c.req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return c.json({ error: "Upload at least one PDF." }, 400);
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".pdf")) return c.json({ error: `${f.name} is not a PDF.` }, 400);
    if (f.size > MAX_PDF_BYTES) return c.json({ error: `${f.name} is larger than 30 MB.` }, 400);
  }
  const id = newId();
  const title = String(form.get("title") || files[0]!.name.replace(/\.pdf$/i, ""));
  const dir = join(DATA_DIR, "sets", id);
  mkdirSync(dir, { recursive: true });

  db.query("INSERT INTO sets (id, title, created_at) VALUES (?, ?, ?)").run(id, title, now());
  for (const f of files) {
    const fileId = newId();
    const path = join(dir, `${fileId}.pdf`);
    await Bun.write(path, f);
    db.query("INSERT INTO files (id, set_id, name, path, size) VALUES (?, ?, ?, ?, ?)").run(
      fileId,
      id,
      f.name,
      path,
      f.size,
    );
  }
  return c.json({ id, title });
});

sets.delete("/:id", (c) => {
  const id = c.req.param("id");
  db.query("DELETE FROM sets WHERE id = ?").run(id);
  rmSync(join(DATA_DIR, "sets", id), { recursive: true, force: true });
  return c.json({ ok: true });
});

sets.get("/files/:fileId", (c) => {
  const f = db.query<any, [string]>("SELECT * FROM files WHERE id = ?").get(c.req.param("fileId"));
  if (!f) return c.notFound();
  return new Response(Bun.file(f.path), { headers: { "Content-Type": "application/pdf" } });
});
