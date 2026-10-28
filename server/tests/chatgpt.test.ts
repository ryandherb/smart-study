import { afterAll, beforeAll, expect, test, spyOn } from "bun:test";
import { mkdtemp, mkdir, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const dir = await mkdtemp(join(tmpdir(), "study-provider-test-"));
process.env.STUDY_DATA_DIR = dir;
const originalPath = process.env.PATH;
const bin = join(dir, "bin");
const responseFile = join(dir, "mock-response.json");
const { db } = await import("../src/db/db");
const { createPlanServer, createTopicServer } = await import("../src/tutor/tools");
const { chatgptTurn, parseResponse } = await import("../src/tutor/chatgpt");
const { getSession, sessionSnapshot, recordAttempt, getQuestion } = await import("../src/db/repo");
const { usageView } = await import("../src/tutor/usage");
const { fileBlocks } = await import("../src/tutor/pages");

beforeAll(async () => {
  await mkdir(bin);
  const bun = process.execPath;
  await Bun.write(join(bin, "mock-codex.js"), `#!${bun}\nconst args = process.argv.slice(2);\nawait Bun.write(${JSON.stringify(join(dir, "last-args"))}, JSON.stringify(args));\nif (args[0] === 'login') { console.error('Logged in using ChatGPT'); process.exit(0); }\nconst prompt = await Bun.stdin.text();\nawait Bun.write(${JSON.stringify(join(dir, "last-prompt"))}, prompt);\nawait Bun.write(args[args.indexOf('-o') + 1], await Bun.file(${JSON.stringify(responseFile)}).text());\nconsole.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:100, cached_input_tokens:30, output_tokens:20}}));\n`);
  await chmod(join(bin, "mock-codex.js"), 0o755);

  db.query("INSERT INTO sets VALUES (?, ?, ?)").run("set", "Study", Date.now());
  db.query("INSERT INTO sessions (id, set_id, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run("session", "set", "chatgpt", Date.now(), Date.now());
  const pdf = await PDFDocument.create(); pdf.addPage();
  const path = join(dir, "exam.pdf"); await Bun.write(path, await pdf.save());
  db.query("INSERT INTO files VALUES (?, ?, ?, ?, ?)").run("file", "set", "exam.pdf", path, 100);
});
afterAll(async () => {
  process.env.PATH = originalPath;
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const respond = (value: unknown) => Bun.write(responseFile, JSON.stringify(value));
const turn = (definition: any, topicKey?: string, side = false) => chatgptTurn({
  executable: join(bin, "mock-codex.js"), sessionId: "session", topicKey, definition, system: "Tutor", blocks: [{ type: "text", text: "Student input" }], side, signal: new AbortController().signal,
});



test("renders PDF material and saves a validated plan with page refs", async () => {
  await respond({ arguments: { topics: [{ id: "algebra", title: "Algebra", notes: "Equations", pages: [{ file: "exam.pdf", page: 1 }] }] } });
  const { definition } = createPlanServer("set", () => {});
  await chatgptTurn({ executable: join(bin, "mock-codex.js"), sessionId: "session", definition, system: "Plan", blocks: await fileBlocks(["file"]), signal: new AbortController().signal });
  expect(db.query<any, []>("SELECT * FROM set_topics").get().key).toBe("algebra");
  expect(await Bun.file(join(dir, "last-prompt")).text()).toContain("Image 1: exam.pdf");
  db.exec("INSERT INTO topics (session_id, key, title, pages, status, order_idx) SELECT 'session', key, title, pages, 'active', order_idx FROM set_topics");
  db.exec("UPDATE sessions SET current_topic = 'algebra', flow = 'topic'");
});

test("asks, grades, scaffolds and persists topic history across turns", async () => {
  const { definition } = createTopicServer("session", () => {}, { onTurnOk: () => {}, onFinishTopic: () => {} });
  const question = { type: "free", prompt_md: "Solve x + 1 = 3" };
  await respond({ arguments: { move: "next", question } });
  await turn(definition, "algebra");
  const original = getSession("session")!.current_question_id!;
  recordAttempt(original, "5");
  await respond({ text: "Try an easier step.", arguments: { grade: { verdict: "incorrect", feedback_md: "Subtract 1." }, move: "easier", question: { ...question, prompt_md: "What is 3 - 1?" } } });
  await turn(definition, "algebra");
  expect(JSON.parse(getSession("session")!.scaffold_stack)).toEqual([original]);
  expect(getQuestion(getSession("session")!.current_question_id!)!.depth).toBe(1);
  const history = db.query<any, []>("SELECT history FROM provider_history").get();
  expect(JSON.parse(history.history)).toHaveLength(2);
  expect(await Bun.file(join(dir, "last-prompt")).text()).toContain("Solve x + 1 = 3");
  expect(sessionSnapshot("session")!.provider).toBe("chatgpt");
  expect(usageView("session").limits).toBeNull();
  expect(usageView("session").total).toBe(360);
});

test("side questions preserve the open question", async () => {
  const before = getSession("session")!.current_question_id;
  const { definition } = createTopicServer("session", () => {}, { onTurnOk: () => {}, onFinishTopic: () => {} });
  await respond({ text: "Subtraction undoes addition.", arguments: { move: "finish_topic" } });
  expect(await turn(definition, "algebra", true)).toBe("Subtraction undoes addition.");
  expect(getSession("session")!.current_question_id).toBe(before);
});

test("invalid actions and cancelled turns leave question state unchanged", async () => {
  const before = getSession("session")!.current_question_id;
  const { definition } = createTopicServer("session", () => {}, { onTurnOk: () => {}, onFinishTopic: () => {} });
  await respond({ arguments: { move: "not-a-move" } });
  await expect(turn(definition, "algebra")).rejects.toThrow("invalid tutor action");
  expect(getSession("session")!.current_question_id).toBe(before);
  await expect(chatgptTurn({ executable: join(bin, "mock-codex.js"), sessionId: "session", definition, system: "", blocks: [], signal: AbortSignal.abort() })).rejects.toThrow("cancelled");
});

test("older sessions default to Claude and fenced JSON is accepted", () => {
  db.query("INSERT INTO sessions (id, set_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run("old", "set", 1, 1);
  expect(getSession("old")!.provider).toBe("claude");
  expect(parseResponse('```json\n{"text":"hello"}\n```')).toEqual({ text: "hello" });
});


test("session API rejects unknown providers and cross-provider models", async () => {
  const { sessions } = await import("../src/routes/sessions");
  const request = (body: unknown) => sessions.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const unknown = await request({ setId: "set", provider: "unknown" });
  expect(unknown.status).toBe(400);
  const wrongModel = await request({ setId: "set", provider: "chatgpt", model: "claude-sonnet-5-5" });
  expect(wrongModel.status).toBe(400);
});

test("new sessions store defaults and Study again can reuse the stored model", async () => {
  const providers = await import("../src/tutor/providers");
  const { Tutor, dropTutor } = await import("../src/tutor/agent");
  const { sessions } = await import("../src/routes/sessions");
  const { sets } = await import("../src/routes/sets");
  const status = spyOn(providers, "providerStatus").mockResolvedValue([
    { id: "claude", available: true, label: "Claude", hint: "" },
    { id: "chatgpt", available: true, label: "ChatGPT", hint: "" },
  ]);
  const begin = spyOn(Tutor.prototype, "begin").mockResolvedValue(undefined);
  const ids: string[] = [];
  try {
    for (const [provider, requested, expected] of [
      ["claude", undefined, "claude-sonnet-5-5"],
      ["chatgpt", undefined, "gpt-6.1-sol"],
      ["chatgpt", "gpt-6.1-sol", "gpt-6.1-sol"],
      ["claude", "claude-opus-5-5", "claude-opus-5-5"],
      ["chatgpt", "  ", "gpt-6.1-sol"],
    ]) {
      const response = await sessions.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId: "set", provider, model: requested }) });
      expect(response.status).toBe(200);
      const { id } = await response.json() as { id: string };
      ids.push(id);
      expect(getSession(id)!.model).toBe(expected!);
      const listing = await (await sets.request("/")).json() as { sessions: { id: string; model: string; provider: string }[] }[];
      expect(listing[0]!.sessions.find(s => s.id === id)).toMatchObject({ model: expected, provider });
    }
  } finally {
    begin.mockRestore();
    status.mockRestore();
    for (const id of ids) { dropTutor(id); db.query("DELETE FROM sessions WHERE id = ?").run(id); }
  }
});

test("Codex receives the saved model and legacy sessions still use its default", async () => {
  const { definition } = createTopicServer("session", () => {}, { onTurnOk: () => {}, onFinishTopic: () => {} });
  await respond({ text: "Explanation" });
  db.query("UPDATE sessions SET model = ? WHERE id = ?").run("gpt-6.1-sol", "session");
  try {
    await turn(definition, undefined, true);
    const args = JSON.parse(await Bun.file(join(dir, "last-args")).text()) as string[];
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-6.1-sol");
  } finally { db.query("UPDATE sessions SET model = NULL WHERE id = ?").run("session"); }
  await turn(definition, undefined, true);
  expect(JSON.parse(await Bun.file(join(dir, "last-args")).text())).not.toContain("--model");
});

test("returning to the original and finishing uses the shared tutor state", async () => {
  let finished = false;
  const { definition } = createTopicServer("session", () => {}, { onTurnOk: () => {}, onFinishTopic: () => { finished = true; } });
  const current = getSession("session")!.current_question_id!;
  recordAttempt(current, "2");
  await respond({ arguments: { grade: { verdict: "correct", feedback_md: "Yes" }, move: "back_to_original", question: { type: "free", prompt_md: "Now solve the original" } } });
  await turn(definition, "algebra");
  expect(JSON.parse(getSession("session")!.scaffold_stack)).toEqual([]);
  await respond({ arguments: { move: "finish_topic", topic_outcome: "mastered" } });
  await turn(definition, "algebra");
  expect(finished).toBe(true);
  expect(getSession("session")!.current_question_id).toBeNull();
});
