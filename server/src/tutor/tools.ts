import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { db, newId, now } from "../db/db";
import {
  getQuestion,
  getSession,
  getStack,
  gradeLatestAttempt,
  listTopics,
  setTopicStatus,
  updateSession,
} from "../db/repo";

export const SERVER_NAME = "tutor";
export const toolId = (name: string) => `mcp__${SERVER_NAME}__${name}`;

type Emit = (event: string, data?: unknown) => void;

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

export function createTutorServer(sessionId: string, emit: Emit, enabled: string[]) {
  const changed = () => emit("snapshot");

  const tools = [
    tool(
      "extract_topics",
      "Register the ordered list of topics to study, derived from the material. Call once at the start (calling again replaces pending topics).",
      {
        topics: z
          .array(
            z.object({
              id: z.string().describe("short slug, e.g. 'big-o' or 'q3-dynamic-programming'"),
              title: z.string(),
              source_pages: z.string().optional().describe("e.g. 'exam1.pdf p.2-3'"),
              difficulty: z.number().int().min(1).max(5).optional(),
            }),
          )
          .min(1),
      },
      async ({ topics }) => {
        const tx = db.transaction(() => {
          db.query("DELETE FROM topics WHERE session_id = ? AND status = 'pending'").run(sessionId);
          const base = (
            db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM topics WHERE session_id = ?").get(sessionId)!
          ).n;
          topics.forEach((t, i) =>
            db
              .query(
                "INSERT OR REPLACE INTO topics (session_id, key, title, source_pages, difficulty, status, order_idx) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
              )
              .run(sessionId, t.id, t.title, t.source_pages ?? null, t.difficulty ?? null, base + i),
          );
        });
        tx();
        changed();
        return ok(`Registered ${topics.length} topics. Now call next_topic for the first one.`);
      },
    ),

    tool(
      "next_topic",
      "Finish the current topic (recording how it went) and make the given topic active.",
      {
        topic_id: z.string(),
        previous_outcome: z
          .enum(["mastered", "struggled", "skipped"])
          .optional()
          .describe("outcome of the topic being left, if any"),
      },
      async ({ topic_id, previous_outcome }) => {
        const s = getSession(sessionId)!;
        if (!listTopics(sessionId).some((t) => t.key === topic_id))
          return fail(`Unknown topic '${topic_id}'. Call extract_topics first or use an existing id.`);
        if (s.current_topic && s.current_topic !== topic_id)
          setTopicStatus(sessionId, s.current_topic, previous_outcome ?? "mastered");
        setTopicStatus(sessionId, topic_id, "active");
        updateSession(sessionId, { current_topic: topic_id, scaffold_stack: "[]" });
        changed();
        return ok(`Topic '${topic_id}' is now active. Ask the first question with ask_question.`);
      },
    ),

    tool(
      "ask_question",
      "Show ONE question to the student. After calling this, end your turn and wait for their answer.",
      {
        prompt_md: z.string().describe("the question, in Markdown with LaTeX/code"),
        type: z.enum(["free", "mcq", "numeric", "code"]),
        choices: z.array(z.string()).optional().describe("for mcq: the answer options (markdown), without letters"),
        language: z.string().optional().describe("for code questions: e.g. 'python', 'c', 'java'"),
        difficulty: z.number().int().min(1).max(5).optional(),
        parent_question_id: z
          .string()
          .optional()
          .describe("for scaffold questions: the harder question this one is stepping down from"),
        source_ref: z
          .object({ file: z.string(), page: z.number().int().optional() })
          .optional()
          .describe("which uploaded file/page this question is based on"),
      },
      async (args) => {
        const s = getSession(sessionId)!;
        if (!s.current_topic) return fail("No active topic. Call next_topic first.");
        if (args.type === "mcq" && !args.choices?.length) return fail("mcq questions need choices.");
        const id = newId().slice(0, 8);
        const depth = getStack(s).length;
        db.query(
          `INSERT INTO questions (id, session_id, topic_key, prompt_md, type, choices, language, difficulty, depth, parent_question_id, source_ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          sessionId,
          s.current_topic,
          args.prompt_md,
          args.type,
          args.choices ? JSON.stringify(args.choices) : null,
          args.language ?? null,
          args.difficulty ?? null,
          depth,
          args.parent_question_id ?? null,
          args.source_ref ? JSON.stringify(args.source_ref) : null,
          now(),
        );
        updateSession(sessionId, { current_question_id: id });
        emit("question", { id });
        changed();
        return ok(`Question ${id} is now shown to the student. End your turn and wait for their answer.`);
      },
    ),

    tool(
      "grade_answer",
      "Grade the student's answer to a question and show feedback.",
      {
        question_id: z.string(),
        verdict: z.enum(["correct", "partial", "incorrect"]),
        feedback_md: z.string().describe("why it is right/wrong; for wrong answers, hint at the gap rather than only dumping the solution"),
        misconception: z.string().optional().describe("short label for the underlying misconception, if any"),
      },
      async ({ question_id, verdict, feedback_md, misconception }) => {
        if (!getQuestion(question_id)) return fail(`Unknown question_id '${question_id}'.`);
        gradeLatestAttempt(question_id, verdict, feedback_md, misconception);
        emit("graded", { questionId: question_id, verdict, feedbackMd: feedback_md, misconception });
        changed();
        return ok(
          verdict === "correct"
            ? "Graded. Decide the next step (next question, return_to_original, or next_topic)."
            : "Graded. Now call start_scaffold and ask an easier question.",
        );
      },
    ),

    tool(
      "start_scaffold",
      "Step down from a question the student missed: push it onto the stack of originals to return to.",
      {
        original_question_id: z.string(),
        reason: z.string().describe("the gap you are addressing, shown to the student"),
      },
      async ({ original_question_id, reason }) => {
        if (!getQuestion(original_question_id)) return fail(`Unknown question_id '${original_question_id}'.`);
        const s = getSession(sessionId)!;
        const stack = getStack(s);
        if (stack.at(-1) !== original_question_id) stack.push(original_question_id);
        updateSession(sessionId, { scaffold_stack: JSON.stringify(stack) });
        emit("scaffold", { direction: "down", reason, depth: stack.length });
        changed();
        return ok(`Scaffold depth is now ${stack.length}. Ask an easier question with parent_question_id='${original_question_id}'.`);
      },
    ),

    tool(
      "return_to_original",
      "The student has rebuilt the missing skill: pop back up to the question they originally missed, then re-ask it with ask_question.",
      {},
      async () => {
        const s = getSession(sessionId)!;
        const stack = getStack(s);
        const original = stack.pop();
        if (!original) return fail("Scaffold stack is empty; nothing to return to.");
        updateSession(sessionId, { scaffold_stack: JSON.stringify(stack) });
        const q = getQuestion(original)!;
        emit("scaffold", { direction: "up", depth: stack.length });
        changed();
        return ok(
          `Returned to original question ${original} (depth now ${stack.length}). Its prompt was:\n\n${q.prompt_md}\n\nRe-ask it (or an isomorphic variant) with ask_question` +
            (stack.length ? `, parent_question_id='${stack.at(-1)}'.` : "."),
        );
      },
    ),

    tool(
      "finish_session",
      "End the study session with a summary.",
      { summary_md: z.string(), last_topic_outcome: z.enum(["mastered", "struggled", "skipped"]).optional() },
      async ({ summary_md, last_topic_outcome }) => {
        const s = getSession(sessionId)!;
        if (s.current_topic) setTopicStatus(sessionId, s.current_topic, last_topic_outcome ?? "mastered");
        updateSession(sessionId, { status: "finished", summary_md, current_question_id: null });
        emit("finished");
        changed();
        return ok("Session finished. End your turn.");
      },
    ),
  ].filter((t) => enabled.includes(t.name));

  return {
    server: createSdkMcpServer({ name: SERVER_NAME, version: "1.0.0", tools }),
    toolIds: tools.map((t) => toolId(t.name)),
  };
}
