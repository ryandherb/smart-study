import { query, type Options, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { chatgptTurn } from "./chatgpt";
import { db } from "../db/db";
import { addMessage, getQuestion, getSession, listTopics, sessionSnapshot, stateLine, updateSession } from "../db/repo";
import { fileBlocks, pageBlocks, type PageRef } from "./pages";
import { MODES } from "./prompt";
import { createPlanServer, createTopicServer } from "./tools";
import { recordContext, recordRateLimit, recordResult, usageView } from "./usage";

type Listener = (event: string, data: unknown) => void;
type Content = Exclude<SDKUserMessage["message"]["content"], string>;

/** Minimal push-based async iterable used as the SDK's streaming input. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(msg: SDKUserMessage) {
    if (this.waiter) {
      this.waiter({ value: msg, done: false });
      this.waiter = null;
    } else this.items.push(msg);
  }

  close() {
    this.closed = true;
    this.waiter?.({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => (this.waiter = resolve));
      },
    };
  }
}

const userMessage = (content: Content): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content },
  parent_tool_use_id: null,
});

/** Options shared by every conversation: only our own tool, nothing from the user's Claude setup. */
const BASE_OPTIONS: Partial<Options> = {
  // Without these, the account's claude.ai connectors (Gmail, Notion, …) get loaded
  // and add ~140k tokens of tool definitions to every request.
  strictMcpConfig: true,
  settings: { disableClaudeAiConnectors: true },
  tools: [], // no built-in tools: material is attached inline
  permissionMode: "dontAsk",
  settingSources: [],
};

/** One plan per set at a time, even if several sessions start together. */
const planning = new Map<string, Promise<boolean>>();

const planExists = (setId: string) =>
  !!db.query("SELECT 1 FROM set_topics WHERE set_id = ? LIMIT 1").get(setId);

export class Tutor {
  private q: Query | null = null;
  private chatgptAbort: AbortController | null = null;
  private input: InputQueue | null = null;
  private listeners = new Set<Listener>();
  busy = false;
  /** Tutor text in the current turn is a reply to a side question rather than a note. */
  private textKind: "note" | "side" = "note";
  /** Set by a successful tool call; the PostToolUse hook then ends the turn without another model call. */
  private turnOk = false;
  /** Set by finish_topic; the next topic starts once the turn's result arrives. */
  private topicDone = false;

  constructor(readonly sessionId: string) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit = (event: string, data?: unknown) => {
    const payload = event === "snapshot" ? this.snapshot() : data;
    for (const fn of this.listeners) fn(event, payload);
  };

  snapshot() {
    return { ...sessionSnapshot(this.sessionId), busy: this.busy, usage: usageView(this.sessionId) };
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.emit("status", { busy });
  }

  private fail(err: unknown) {
    console.error(`[tutor ${this.sessionId}]`, err);
    this.emit("error", { message: String((err as Error)?.message ?? err) });
    this.setBusy(false);
  }

  /** Ends the turn right after our tool succeeds, saving the follow-up model call. */
  private endTurnHook(toolName: string): Options["hooks"] {
    return {
      PostToolUse: [
        {
          matcher: toolName,
          hooks: [
            async () => {
              if (!this.turnOk) return {}; // tool rejected the call: let the model fix it
              this.turnOk = false;
              return { continue: false, stopReason: "turn complete" };
            },
          ],
        },
      ],
    };
  }

  /** Bookkeeping shared by the planning and topic conversations. */
  private track(m: SDKMessage) {
    if (m.type === "rate_limit_event") {
      recordRateLimit(this.sessionId, m.rate_limit_info);
      this.emit("usage", usageView(this.sessionId));
    } else if (m.type === "assistant" && !m.parent_tool_use_id) {
      recordContext(this.sessionId, m.message.usage);
      if (m.error) this.emit("error", { message: `Claude error: ${m.error}` });
    } else if (m.type === "result") {
      recordResult(this.sessionId, m.session_id, m.modelUsage, m.total_cost_usd);
      this.emit("usage", usageView(this.sessionId));
    }
  }

  // ---------------------------------------------------------------- planning

  /** Reads all of the set's PDFs once and stores the topic plan. Shared by every session of the set. */
  private ensurePlan(): Promise<boolean> {
    const s = getSession(this.sessionId)!;
    if (planExists(s.set_id)) return Promise.resolve(true);
    let p = planning.get(s.set_id);
    if (!p) {
      p = this.runPlan(s.set_id, s.model ?? undefined, s.mode).finally(() => planning.delete(s.set_id));
      planning.set(s.set_id, p);
    }
    return p;
  }

  private async runPlan(setId: string, model: string | undefined, modeId: string) {
    const mode = MODES[modeId] ?? MODES.adaptive!;
    const { server, toolIds, definition } = createPlanServer(setId, () => (this.turnOk = true));
    const files = db.query<{ id: string; name: string }, [string]>("SELECT id, name FROM files WHERE set_id = ?").all(setId);
    const sourceText = db.query<{ source_text: string | null }, [string]>("SELECT source_text FROM sets WHERE id = ?").get(setId)?.source_text;
    const content = [
      ...(await fileBlocks(files.map((f) => f.id))),
      { type: "text", text: sourceText
        ? `Student's study request:\n${sourceText}\n\nFiles: ${files.map((f) => f.name).join(", ") || "none"}. Build the study plan from this request and any attached files.`
        : `Files: ${files.map((f) => f.name).join(", ")}. Build the study plan.` },
    ] as Content;

    if (getSession(this.sessionId)!.provider === "chatgpt") {
      const controller = new AbortController();
      this.chatgptAbort = controller;
      try {
        await chatgptTurn({ sessionId: this.sessionId, system: mode.planPrompt, blocks: content as any,
          definition, signal: controller.signal });
        this.emit("usage", usageView(this.sessionId));
        return planExists(setId);
      } finally { if (this.chatgptAbort === controller) this.chatgptAbort = null; }
    }

    const q = query({
      prompt: (async function* () {
        yield userMessage(content);
      })(),
      options: {
        ...BASE_OPTIONS,
        systemPrompt: mode.planPrompt,
        model,
        mcpServers: { tutor: server },
        allowedTools: toolIds,
        hooks: this.endTurnHook(toolIds[0]!),
        maxTurns: 6,
        persistSession: false,
      },
    });
    for await (const m of q) {
      this.track(m);
      if (m.type === "result") break;
    }
    return planExists(setId);
  }

  // ---------------------------------------------------------------- topics

  /** Starts a fresh session: plan (once per set), copy topics, start the first one. */
  async begin() {
    this.setBusy(true);
    try {
      if (!(await this.ensurePlan())) throw new Error("The tutor didn't produce a topic plan. Press Retry to try again.");
      const s = getSession(this.sessionId)!;
      db.query(
        `INSERT OR IGNORE INTO topics (session_id, key, title, notes, pages, difficulty, status, order_idx)
         SELECT ?, key, title, notes, pages, difficulty, 'pending', order_idx FROM set_topics WHERE set_id = ? AND (? IS NULL OR key = ?)`,
      ).run(this.sessionId, s.set_id, s.focus_topic_key, s.focus_topic_key);
      updateSession(this.sessionId, { flow: "topic" });
      this.emit("snapshot");
      await this.advance();
    } catch (err) {
      this.fail(err);
    }
  }

  /** Stores the active topic's conversation, open question and scaffold so it can be resumed later. */
  private saveTopicState() {
    const s = getSession(this.sessionId)!;
    if (!s.current_topic) return;
    db.query(
      `UPDATE topics SET sdk_session_id = ?, current_question_id = ?, scaffold_stack = ?,
         status = CASE WHEN status = 'active' THEN 'paused' ELSE status END
       WHERE session_id = ? AND key = ?`,
    ).run(s.sdk_session_id, s.current_question_id, s.scaffold_stack, this.sessionId, s.current_topic);
  }

  /** Makes a topic current, restoring where the student left off. Only asks Claude if no question is open. */
  private async enterTopic(key: string) {
    this.closeConversation();
    const t = listTopics(this.sessionId).find((x) => x.key === key)!;
    // Finished topics keep their outcome while being reviewed; only unfinished ones become 'active'.
    db.query("UPDATE topics SET status = 'active' WHERE session_id = ? AND key = ? AND status IN ('pending', 'paused')").run(
      this.sessionId,
      key,
    );
    updateSession(this.sessionId, {
      status: "active",
      current_topic: key,
      current_question_id: t.current_question_id,
      scaffold_stack: t.scaffold_stack ?? "[]",
      sdk_session_id: t.sdk_session_id,
    });
    if (t.current_question_id) {
      this.setBusy(false);
      this.emit("snapshot");
      return;
    }
    this.emit("snapshot");
    await this.send(t.sdk_session_id ? "[RESUME TOPIC]" : "[BEGIN TOPIC]");
  }

  /** The student picked a topic: pause the current one and switch. */
  async jumpTo(key: string) {
    if (key === getSession(this.sessionId)!.current_topic) return;
    this.saveTopicState();
    try {
      await this.enterTopic(key);
    } catch (err) {
      this.fail(err);
    }
  }

  /** After finish_topic (or at the start): the next unfinished topic after the current one, wrapping around. */
  private async advance() {
    this.saveTopicState();
    const s = getSession(this.sessionId)!;
    const topics = listTopics(this.sessionId);
    const i = topics.findIndex((t) => t.key === s.current_topic);
    const ordered = [...topics.slice(i + 1), ...topics.slice(0, Math.max(i, 0))];
    const next = ordered.find((t) => ["pending", "paused", "active"].includes(t.status));
    if (!next) return this.finishSession();
    await this.enterTopic(next.key);
  }

  private finishSession() {
    this.closeConversation();
    const topics = listTopics(this.sessionId);
    const misconceptions = db
      .query<{ misconception: string }, [string]>(
        `SELECT DISTINCT a.misconception FROM attempts a JOIN questions q ON q.id = a.question_id
         WHERE q.session_id = ? AND a.misconception IS NOT NULL`,
      )
      .all(this.sessionId)
      .map((r) => r.misconception);
    const lines = topics.map(
      (t) => `- **${t.title}**: ${t.status === "paused" ? "not finished" : t.status}${t.outcome_note ? `. ${t.outcome_note}` : ""}`,
    );
    const summary = [
      "### How it went",
      ...lines,
      ...(misconceptions.length ? ["", "### Review these", ...misconceptions.map((m) => `- ${m}`)] : []),
    ].join("\n");
    updateSession(this.sessionId, { status: "finished", summary_md: summary, current_question_id: null });
    this.emit("finished");
    this.setBusy(false);
    this.emit("snapshot");
  }

  /** The current topic's pages, a short brief, and the open question if a conversation is being rebuilt. */
  private async topicIntro(): Promise<Content> {
    const s = getSession(this.sessionId)!;
    const topics = listTopics(this.sessionId);
    const idx = topics.findIndex((t) => t.key === s.current_topic);
    const t = topics[idx]!;
    const pages: PageRef[] | null = t.pages ? JSON.parse(t.pages) : null;
    const files = db.query<{ id: string }, [string]>("SELECT id FROM files WHERE set_id = ?").all(s.set_id);
    const docs = pages ? await pageBlocks(pages) : await fileBlocks(files.map((f) => f.id));

    const done = topics.filter((x) => !["pending", "active"].includes(x.status));
    const open = s.current_question_id ? getQuestion(s.current_question_id) : null;
    const sourceText = db.query<{ source_text: string | null }, [string]>("SELECT source_text FROM sets WHERE id = ?").get(s.set_id)?.source_text;
    const brief = [
      sourceText ? `Student's study request: ${sourceText}\nUse this scope and level for the current topic. When no pages are attached, create original self-contained problems; do not invent source references.` : "",
      `Topic ${idx + 1} of ${topics.length}: ${t.title}`,
      t.notes ? `Notes: ${t.notes}` : "",
      done.length ? `Earlier topics: ${done.map((x) => `${x.title} (${x.status})`).join("; ")}` : "",
      open
        ? `This conversation was restarted. The student currently sees question ${open.id} (depth ${open.depth}):\n${open.prompt_md}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return [...docs, { type: "text", text: brief }] as Content;
  }

  /** Opens the topic conversation if needed. Returns intro content when it is a fresh conversation. */
  private async ensureConversation(): Promise<Content> {
    if (this.q) return [];
    let s = getSession(this.sessionId)!;
    if (s.flow !== "topic") {
      // Session from the original single-conversation flow: continue it as per-topic conversations.
      updateSession(this.sessionId, { flow: "topic", sdk_session_id: null });
      s = getSession(this.sessionId)!;
    }
    const mode = MODES[s.mode] ?? MODES.adaptive!;
    const { server, toolIds } = createTopicServer(this.sessionId, this.emit, {
      onTurnOk: () => (this.turnOk = true),
      onFinishTopic: () => (this.topicDone = true),
    });
    const intro = s.sdk_session_id ? [] : await this.topicIntro();

    const input = new InputQueue();
    const q = query({
      prompt: input,
      options: {
        ...BASE_OPTIONS,
        systemPrompt: mode.topicPrompt,
        model: s.model ?? undefined,
        resume: s.sdk_session_id ?? undefined,
        mcpServers: { tutor: server },
        allowedTools: toolIds,
        hooks: this.endTurnHook(toolIds[0]!),
        maxTurns: 500,
      },
    });
    this.q = q;
    this.input = input;
    this.consume(q);
    return intro;
  }

  private async consume(q: Query) {
    try {
      for await (const m of q) {
        this.track(m);
        if (m.type === "system" && m.subtype === "init") {
          updateSession(this.sessionId, { sdk_session_id: m.session_id });
        } else if (m.type === "assistant" && !m.parent_tool_use_id) {
          for (const block of m.message.content) {
            if (block.type === "text" && block.text.trim()) {
              addMessage(this.sessionId, "tutor", this.textKind, block.text.trim());
              this.emit("tutor_text", { text: block.text.trim(), kind: this.textKind });
            }
          }
        } else if (m.type === "result") {
          if (m.subtype !== "success") this.emit("error", { message: `Turn ended: ${m.subtype}` });
          if (this.topicDone) {
            this.topicDone = false;
            void this.advance().catch((e) => this.fail(e));
            return; // advance() replaced this conversation
          }
          this.setBusy(false);
          this.emit("snapshot");
        }
      }
    } catch (err) {
      if (this.q === q) this.fail(err);
    } finally {
      // Loop ended (error or closed): drop it so the next send reopens it with `resume`.
      if (this.q === q) {
        this.q = null;
        this.input = null;
        this.setBusy(false);
      }
    }
  }

  private closeConversation() {
    this.chatgptAbort?.abort();
    this.chatgptAbort = null;
    const q = this.q;
    this.q = null;
    this.input?.close();
    this.input = null;
    q?.close();
  }

  private async send(text: string, kind: "note" | "side" = "note") {
    this.setBusy(true);
    try {
      if (getSession(this.sessionId)!.provider === "chatgpt") {
        await this.sendChatGPT(text, kind);
        return;
      }
      const intro = await this.ensureConversation();
      this.textKind = kind;
      this.turnOk = false;
      this.input!.push(userMessage([...intro, { type: "text", text: `${text}\n\n${stateLine(this.sessionId)}` }] as Content));
    } catch (err) {
      this.fail(err);
    }
  }

  private async sendChatGPT(text: string, kind: "note" | "side") {
    const s = getSession(this.sessionId)!;
    const controller = new AbortController();
    this.chatgptAbort = controller;
    this.topicDone = false;
    const { definition } = createTopicServer(this.sessionId, this.emit, {
      onTurnOk: () => {}, onFinishTopic: () => (this.topicDone = true),
    });
    try {
      const reply = await chatgptTurn({ sessionId: this.sessionId, topicKey: s.current_topic!,
        system: (MODES[s.mode] ?? MODES.adaptive!).topicPrompt,
        blocks: [...await this.topicIntro(), { type: "text", text: `${text}\n\n${stateLine(this.sessionId)}` }] as any,
        definition, side: kind === "side", signal: controller.signal });
      if (reply?.trim()) {
        addMessage(this.sessionId, "tutor", kind, reply.trim());
        this.emit("tutor_text", { text: reply.trim(), kind });
      }
      this.emit("usage", usageView(this.sessionId));
      if (this.topicDone) { this.topicDone = false; await this.advance(); }
      else { this.setBusy(false); this.emit("snapshot"); }
    } finally { if (this.chatgptAbort === controller) this.chatgptAbort = null; }
  }

  /** `notes` are app-added lines after the answer: local test results, whether the reference was viewed. */
  answer(questionId: string, answer: string, notes: string[] = []) {
    return this.send([`[ANSWER question_id=${questionId}]`, answer, ...notes].join("\n"));
  }

  control(kind: "CONFUSED" | "SKIP", questionId: string) {
    return this.send(`[${kind} question_id=${questionId}]`);
  }

  side(text: string) {
    addMessage(this.sessionId, "user", "side", text);
    return this.send(`[SIDE QUESTION]\n${text}`, "side");
  }

  /** Recovers a session that stalled (failed plan, failed turn, no open question). */
  retry() {
    const s = getSession(this.sessionId)!;
    if (!listTopics(this.sessionId).length) return this.begin();
    if (!s.current_question_id) return s.current_topic ? this.send("[BEGIN TOPIC]") : this.advance();
  }

  close() {
    this.closeConversation();
  }
}

const tutors = new Map<string, Tutor>();

export function getTutor(sessionId: string) {
  let t = tutors.get(sessionId);
  if (!t) tutors.set(sessionId, (t = new Tutor(sessionId)));
  return t;
}

export function dropTutor(sessionId: string) {
  tutors.get(sessionId)?.close();
  tutors.delete(sessionId);
}
