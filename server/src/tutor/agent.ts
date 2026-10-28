import { query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { db } from "../db/db";
import { addMessage, getSession, sessionSnapshot, stateLine, updateSession } from "../db/repo";
import { MODES } from "./prompt";
import { createTutorServer } from "./tools";

type Listener = (event: string, data: unknown) => void;

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

const userMessage = (content: SDKUserMessage["message"]["content"]): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content },
  parent_tool_use_id: null,
});

export class Tutor {
  private input = new InputQueue();
  private q: Query | null = null;
  private listeners = new Set<Listener>();
  busy = false;
  /** Tutor text in the current turn is a reply to a side question rather than a note. */
  private textKind: "note" | "side" = "note";

  constructor(readonly sessionId: string) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit = (event: string, data?: unknown) => {
    const payload = event === "snapshot" ? { ...sessionSnapshot(this.sessionId), busy: this.busy } : data;
    for (const fn of this.listeners) fn(event, payload);
  };

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.emit("status", { busy });
  }

  /** Starts the agent loop on first use; resumes the SDK session if one exists. */
  private ensureStarted() {
    if (this.q) return;
    const s = getSession(this.sessionId)!;
    const mode = MODES[s.mode] ?? MODES.adaptive!;
    const { server, toolIds } = createTutorServer(this.sessionId, this.emit, mode.tools);

    this.q = query({
      prompt: this.input,
      options: {
        systemPrompt: mode.systemPrompt,
        model: s.model ?? undefined,
        resume: s.sdk_session_id ?? undefined,
        mcpServers: { tutor: server },
        tools: [], // no built-in tools: PDFs are attached inline, the tutor only uses its own tools
        allowedTools: toolIds,
        permissionMode: "dontAsk",
        settingSources: [],
        maxTurns: 40,
      },
    });
    this.consume(this.q);
  }

  private async consume(q: Query) {
    try {
      for await (const m of q) {
        if (m.type === "system" && m.subtype === "init") {
          updateSession(this.sessionId, { sdk_session_id: m.session_id });
        } else if (m.type === "assistant" && !m.parent_tool_use_id) {
          for (const block of m.message.content) {
            if (block.type === "text" && block.text.trim()) {
              addMessage(this.sessionId, "tutor", this.textKind, block.text.trim());
              this.emit("tutor_text", { text: block.text.trim(), kind: this.textKind });
            }
          }
          if (m.error) this.emit("error", { message: `Claude error: ${m.error}` });
        } else if (m.type === "result") {
          if (m.subtype !== "success") this.emit("error", { message: `Turn ended: ${m.subtype}` });
          this.setBusy(false);
          this.emit("snapshot");
        }
      }
    } catch (err) {
      console.error(`[tutor ${this.sessionId}]`, err);
      this.emit("error", { message: String((err as Error)?.message ?? err) });
    } finally {
      // Loop ended (error or closed): drop it so the next send restarts with `resume`.
      if (this.q === q) {
        this.q = null;
        this.input = new InputQueue();
      }
      this.setBusy(false);
    }
  }

  private send(
    text: string,
    attachments: SDKUserMessage["message"]["content"] = [],
    kind: "note" | "side" = "note",
  ) {
    this.ensureStarted();
    this.textKind = kind;
    const content = [
      ...(attachments as any[]),
      { type: "text", text: `${text}\n\n${stateLine(this.sessionId)}` },
    ];
    this.setBusy(true);
    this.input.push(userMessage(content as any));
  }

  /** First turn: attach the PDFs and let the tutor build the topic list. */
  begin() {
    const s = getSession(this.sessionId)!;
    const files = db
      .query<{ name: string; path: string }, [string]>("SELECT name, path FROM files WHERE set_id = ?")
      .all(s.set_id);
    const docs = files.map((f) => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: readFileSync(f.path).toString("base64") },
      title: f.name,
    }));
    const names = files.map((f) => f.name).join(", ");
    this.send(`Here is my study material: ${names}. Start the session.`, docs as any);
  }

  answer(questionId: string, answer: string) {
    this.send(`[ANSWER question_id=${questionId}]\n${answer}`);
  }

  control(kind: "CONFUSED" | "SKIP" | "RESUME", questionId: string) {
    this.send(`[${kind} question_id=${questionId}]`);
  }

  side(text: string) {
    addMessage(this.sessionId, "user", "side", text);
    this.send(`[SIDE QUESTION]\n${text}`, [], "side");
  }

  close() {
    this.q?.close();
    this.input.close();
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
