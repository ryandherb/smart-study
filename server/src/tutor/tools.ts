import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { db, newId, now } from "../db/db";
import { getSession, getStack, gradeLatestAttempt, updateSession } from "../db/repo";
import { pageCount } from "./pages";
import { canRun, runTests } from "./runner";

export const SERVER_NAME = "tutor";
export const toolId = (name: string) => `mcp__${SERVER_NAME}__${name}`;

type Emit = (event: string, data?: unknown) => void;

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

const outcome = z.enum(["mastered", "struggled", "skipped"]);

/** Planning pass: one tool that stores the set's topic plan. */
export function createPlanServer(setId: string, onSaved: () => void) {
  const files = db.query<{ id: string; name: string }, [string]>("SELECT id, name FROM files WHERE set_id = ?").all(setId);
  const savePlan = tool(
    "save_plan",
    "Save the ordered topic plan for this study material.",
    {
      topics: z
        .array(
          z.object({
            id: z.string().describe("short slug, e.g. 'recursive-backtracking'"),
            title: z.string(),
            notes: z.string().describe("2–4 sentences for the tutor: which problems, key ideas, pitfalls"),
            pages: z
              .array(z.object({ file: z.string(), page: z.number().int().min(1) }))
              .min(files.length ? 1 : 0)
              .max(4),
            difficulty: z.number().int().min(1).max(5).optional(),
          }),
        )
        .min(1),
    },
    async ({ topics }) => {
      // Validate every page reference before writing anything.
      const resolved: { fileId: string; page: number }[][] = [];
      for (const t of topics) {
        const refs = [];
        for (const p of t.pages) {
          const f = files.find((f) => f.name === p.file) ?? files.find((f) => f.name.includes(p.file) || p.file.includes(f.name));
          if (!f) return fail(`Topic '${t.id}': unknown file '${p.file}'. Files: ${files.map((f) => f.name).join(", ")}`);
          const count = await pageCount(f.id);
          if (count !== null && p.page > count) return fail(`Topic '${t.id}': ${f.name} has only ${count} pages (got ${p.page}).`);
          refs.push({ fileId: f.id, page: p.page });
        }
        resolved.push(refs);
      }
      db.transaction(() => {
        db.query("DELETE FROM set_topics WHERE set_id = ?").run(setId);
        topics.forEach((t, i) =>
          db
            .query(
              "INSERT OR REPLACE INTO set_topics (set_id, key, title, notes, pages, difficulty, order_idx) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .run(setId, t.id, t.title, t.notes, JSON.stringify(resolved[i]), t.difficulty ?? null, i),
        );
      })();
      onSaved();
      return ok(`Saved ${topics.length} topics.`);
    },
  );
  return { definition: savePlan, server: createSdkMcpServer({ name: SERVER_NAME, version: "1.0.0", tools: [savePlan] }), toolIds: [toolId("save_plan")] };
}

/**
 * Keeps a harness only if the reference solution passes it, so the student is never graded by broken tests.
 * A bad harness is dropped rather than rejected: asking the model to fix it would cost another call.
 */
async function verifiedHarness(language: string | undefined, harness?: string, reference?: string) {
  if (!harness || !reference || !canRun(language)) return null;
  const r = await runTests(language!, harness, reference);
  if (r.status === "ok" && r.total > 0 && r.passed === r.total) return harness;
  console.warn(`[tests] dropped harness (${language}): reference got ${r.passed}/${r.total}, ${r.status}\n${r.output.slice(0, 500)}`);
  return null;
}

/** Topic conversation: a single tool per turn that grades, moves, and asks the next question. */
export function createTopicServer(
  sessionId: string,
  emit: Emit,
  hooks: { onTurnOk: () => void; onFinishTopic: () => void },
) {
  const changed = () => emit("snapshot");

  const tutorTurn = tool(
    "tutor_turn",
    "Do one tutoring step: optionally grade the current question, then move (next / easier / back_to_original / retry / finish_topic) and give the next question. Call exactly once per turn.",
    {
      grade: z
        .object({
          verdict: z.enum(["correct", "partial", "incorrect"]),
          feedback_md: z.string(),
          misconception: z.string().optional().describe("short label for the underlying misconception, if any"),
        })
        .optional()
        .describe("grades the current open question; omit when there is no answer to grade"),
      move: z
        .enum(["next", "easier", "back_to_original", "retry", "finish_topic"])
        .describe("'retry' keeps the current question open so the student can revise their answer (needs grade, no question)"),
      reason: z.string().optional().describe("for 'easier': the gap this step addresses, shown to the student"),
      question: z
        .object({
          prompt_md: z.string(),
          type: z.enum(["free", "mcq", "numeric", "code"]),
          choices: z.array(z.string()).optional().describe("for mcq: answer options (markdown), without letters"),
          language: z.string().optional().describe("for code: e.g. 'java', 'python'"),
          difficulty: z.number().int().min(1).max(5).optional(),
          source: z.object({ file: z.string(), page: z.number().int().optional() }).optional(),
          check: z
            .object({
              reference_md: z.string().describe("worked solution, hidden until the student asks for it"),
              rubric: z.array(z.string()).describe("3-6 short grading criteria"),
              harness: z
                .string()
                .optional()
                .describe("for code: complete test program with a STUDENT_CODE_HERE comment line; prints PASS <name> / FAIL <name>: <detail>"),
              reference_code: z.string().optional().describe("for code: the reference solution exactly as it would replace the marker"),
            })
            .optional()
            .describe("hidden answer key for checking the student's work"),
        })
        .optional()
        .describe("required unless move is 'finish_topic' or 'retry'"),
      topic_outcome: outcome.optional().describe("for finish_topic"),
      topic_note: z.string().optional().describe("for finish_topic: one sentence for the session summary"),
    },
    async (args) => {
      const s = getSession(sessionId)!;
      const stack = getStack(s);
      const currentId = s.current_question_id;

      // Validate first so a rejected call leaves no partial state.
      if (args.grade && !currentId) return fail("There is no open question to grade; omit grade.");
      if (args.move === "easier" && !currentId) return fail("No open question to step down from.");
      if (args.move === "back_to_original" && !stack.length) return fail("No original question to return to; use move 'next'.");
      if (args.move === "retry" && (!currentId || !args.grade)) return fail("retry needs an open question and a grade.");
      if (args.move !== "finish_topic" && args.move !== "retry") {
        if (!args.question) return fail("question is required for this move.");
        if (args.question.type === "mcq" && !args.question.choices?.length) return fail("mcq questions need choices.");
      }

      if (args.grade) {
        gradeLatestAttempt(currentId!, args.grade.verdict, args.grade.feedback_md, args.grade.misconception);
        emit("graded", {
          questionId: currentId,
          verdict: args.grade.verdict,
          feedbackMd: args.grade.feedback_md,
          misconception: args.grade.misconception,
        });
      }

      if (args.move === "finish_topic") {
        db.query("UPDATE topics SET status = ?, outcome_note = ? WHERE session_id = ? AND key = ?").run(
          args.topic_outcome ?? "mastered",
          args.topic_note ?? null,
          sessionId,
          s.current_topic,
        );
        updateSession(sessionId, { current_question_id: null, scaffold_stack: "[]" });
        hooks.onFinishTopic();
        hooks.onTurnOk();
        changed();
        return ok("Topic finished.");
      }

      if (args.move === "retry") {
        hooks.onTurnOk();
        changed();
        return ok(`Question ${currentId} stays open for a revised answer.`);
      }

      if (args.move === "easier") {
        if (stack.at(-1) !== currentId) stack.push(currentId!);
        emit("scaffold", { direction: "down", reason: args.reason, depth: stack.length });
      } else if (args.move === "back_to_original") {
        stack.pop();
        emit("scaffold", { direction: "up", depth: stack.length });
      }

      const q = args.question!;
      const id = newId().slice(0, 8);
      const harness = await verifiedHarness(q.language, q.check?.harness, q.check?.reference_code);
      db.query(
        `INSERT INTO questions (id, session_id, topic_key, prompt_md, type, choices, language, difficulty, depth, parent_question_id, source_ref,
           reference_md, rubric, harness, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        sessionId,
        s.current_topic!,
        q.prompt_md,
        q.type,
        q.choices ? JSON.stringify(q.choices) : null,
        q.language ?? null,
        q.difficulty ?? null,
        stack.length,
        stack.at(-1) ?? null,
        q.source ? JSON.stringify(q.source) : null,
        q.check?.reference_md ?? null,
        q.check?.rubric ? JSON.stringify(q.check.rubric) : null,
        harness,
        now(),
      );
      updateSession(sessionId, { current_question_id: id, scaffold_stack: JSON.stringify(stack) });
      emit("question", { id });
      hooks.onTurnOk();
      changed();
      return ok(`Question ${id} shown.`);
    },
  );

  return {
    definition: tutorTurn,
    server: createSdkMcpServer({ name: SERVER_NAME, version: "1.0.0", tools: [tutorTurn] }),
    toolIds: [toolId("tutor_turn")],
  };
}
