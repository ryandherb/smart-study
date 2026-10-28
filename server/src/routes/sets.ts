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
      files: JSON.parse(r.file_names),
      latest: stats.get(r.id),
      sessions: sessions.all(r.id),
    })),
  );
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
