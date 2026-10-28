import { Hono } from "hono";
import { logger } from "hono/logger";
import { sessions } from "./routes/sessions";
import { sets } from "./routes/sets";

const app = new Hono();
app.use("/api/*", logger());
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/sets", sets);
app.route("/api/sessions", sessions);

const port = Number(process.env.PORT ?? 3001);
console.log(`study-claude server on http://localhost:${port}`);

export default { port, fetch: app.fetch, idleTimeout: 0, maxRequestBodySize: 200 * 1024 * 1024 };
