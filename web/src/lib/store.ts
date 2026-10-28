import { create } from "zustand";
import { api, type Feedback, type Question, type Snapshot } from "./api";

interface ScaffoldNotice {
  direction: "down" | "up";
  reason?: string;
  depth: number;
  at: number;
}

interface StudyState {
  snap: Snapshot | null;
  /** Question the student just answered; stays on screen with its feedback until "Continue". */
  pinned: { question: Question; answer: string; stack: Question[] } | null;
  feedback: Feedback | null;
  scaffold: ScaffoldNotice | null;
  error: string | null;
  connect: (id: string) => () => void;
  submit: (answer: string) => Promise<void>;
  control: (kind: "CONFUSED" | "SKIP") => Promise<void>;
  ask: (text: string) => Promise<void>;
  jump: (topicKey: string) => Promise<void>;
  continueOn: () => void;
  clearError: () => void;
}

export const useStudy = create<StudyState>((set, get) => ({
  snap: null,
  pinned: null,
  feedback: null,
  scaffold: null,
  error: null,

  connect(id) {
    set({ snap: null, pinned: null, feedback: null, scaffold: null, error: null });
    api
      .getSession(id)
      .then((snap) => !get().snap && set({ snap }))
      .catch((e) => set({ error: e.message }));
    const es = new EventSource(`/api/sessions/${id}/events`);
    const on = (event: string, fn: (data: any) => void) =>
      es.addEventListener(event, (e) => fn(JSON.parse((e as MessageEvent).data)));

    on("snapshot", (snap: Snapshot) => {
      const { pinned, feedback } = get();
      // A turn that ended without grading the pinned question (e.g. a failed turn) releases the pin.
      const release = pinned && !snap.busy && !feedback && snap.current?.id === pinned.question.id;
      set({ snap, ...(release ? { pinned: null } : {}) });
    });
    on("status", ({ busy }) => {
      const snap = get().snap;
      if (snap) set({ snap: { ...snap, busy } });
    });
    on("usage", (usage) => {
      const snap = get().snap;
      if (snap) set({ snap: { ...snap, usage } });
    });
    on("graded", (fb: Feedback) => {
      if (get().pinned?.question.id === fb.questionId) set({ feedback: fb });
    });
    on("scaffold", (d) => set({ scaffold: { ...d, at: Date.now() } }));
    on("error", (d) => d?.message && set({ error: d.message }));
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) set({ error: "Lost connection to the server." });
    };
    return () => es.close();
  },

  async submit(answer) {
    const { snap } = get();
    if (!snap?.current) return;
    set({ pinned: { question: snap.current, answer, stack: snap.stack }, feedback: null, snap: { ...snap, busy: true } });
    try {
      await api.answer(snap.id, snap.current.id, answer);
    } catch (e) {
      set({ pinned: null, error: (e as Error).message, snap: { ...get().snap!, busy: false } });
    }
  },

  async control(kind) {
    const { snap, pinned } = get();
    const q = pinned?.question ?? snap?.current;
    if (!snap || !q) return;
    set({ pinned: null, feedback: null, snap: { ...snap, busy: true } });
    try {
      await api.control(snap.id, kind, q.id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  async ask(text) {
    const { snap } = get();
    if (!snap) return;
    set({
      snap: {
        ...snap,
        busy: true,
        messages: [...snap.messages, { role: "user", kind: "side", text, created_at: Date.now() }],
      },
    });
    try {
      await api.side(snap.id, text);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  async jump(topicKey) {
    const { snap } = get();
    if (!snap || snap.busy || snap.currentTopic === topicKey) return;
    // Highlight the new topic right away; the server's snapshot fills in its question.
    set({ pinned: null, feedback: null, scaffold: null, snap: { ...snap, busy: true, currentTopic: topicKey, current: null, stack: [] } });
    try {
      await api.jumpTopic(snap.id, topicKey);
    } catch (e) {
      set({ error: (e as Error).message, snap: { ...get().snap!, busy: false } });
    }
  },

  continueOn: () => set({ pinned: null, feedback: null }),
  clearError: () => set({ error: null }),
}));
