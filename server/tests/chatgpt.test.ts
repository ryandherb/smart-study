import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const dir = await mkdtemp(join(tmpdir(), "study-provider-test-"));
process.env.STUDY_DATA_DIR = dir;
const originalPath = process.env.PATH;
const bin = join(dir, "bin");
const responseFile = join(dir, "mock-response.json");
process.env.MOCK_CODEX_RESPONSE = responseFile;
const { db } = await import("../src/db/db");
const { createPlanServer, createTopicServer } = await import("../src/tutor/tools");
const { chatgptTurn, parseResponse } = await import("../src/tutor/chatgpt");
const { getSession, sessionSnapshot, recordAttempt, getQuestion } = await import("../src/db/repo");
const { usageView } = await import("../src/tutor/usage");
const { providerStatus } = await import("../src/tutor/providers");
const { fileBlocks } = await import("../src/tutor/pages");

beforeAll(async () => {
  await mkdir(bin);
  const bun = process.execPath;
  await Bun.write(join(bin, "codex"), `#!${bun}\nconst args = process.argv.slice(2);\nif (args[0] === 'login') { console.error('Logged in using ChatGPT'); process.exit(0); }\nconst prompt = await Bun.stdin.text();\nawait Bun.write(${JSON.stringify(join(dir, "last-prompt"))}, prompt);\nawait Bun.write(args[args.indexOf('-o') + 1], await Bun.file(process.env.MOCK_CODEX_RESPONSE).text());\nconsole.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:100, cached_input_tokens:30, output_tokens:20}}));\n`);
  await chmod(join(bin, "codex"), 0o755);
  process.env.PATH = `${bin}:${originalPath}`;
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
  sessionId: "session", topicKey, definition, system: "Tutor", blocks: [{ type: "text", text: "Student input" }], side, signal: new AbortController().signal,
});

test("detects ChatGPT login without invoking inference", async () => {
  const providers = await providerStatus();
  expect(providers.find(p => p.id === "chatgpt")?.available).toBe(true);
});

test("renders PDF material and saves a validated plan with page refs", async () => {
  await respond({ arguments: { topics: [{ id: "algebra", title: "Algebra", notes: "Equations", pages: [{ file: "exam.pdf", page: 1 }] }] } });
  const { definition } = createPlanServer("set", () => {});
  await chatgptTurn({ sessionId: "session", definition, system: "Plan", blocks: await fileBlocks(["file"]), signal: new AbortController().signal });
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
  await expect(chatgptTurn({ sessionId: "session", definition, system: "", blocks: [], signal: AbortSignal.abort() })).rejects.toThrow("cancelled");
});

test("older sessions default to Claude and fenced JSON is accepted", () => {
  db.query("INSERT INTO sessions (id, set_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run("old", "set", 1, 1);
  expect(getSession("old")!.provider).toBe("claude");
  expect(parseResponse('```json\n{"text":"hello"}\n```')).toEqual({ text: "hello" });
});
