export type Verdict = "correct" | "partial" | "incorrect";
export type QuestionType = "free" | "mcq" | "numeric" | "code";

export interface Question {
  id: string;
  topicKey: string;
  promptMd: string;
  type: QuestionType;
  choices: string[] | null;
  language: string | null;
  difficulty: number | null;
  depth: number;
  parentQuestionId: string | null;
  sourceRef: { file: string; page?: number } | null;
}

export interface Topic {
  key: string;
  title: string;
  sourcePages: string | null;
  difficulty: number | null;
  status: "pending" | "active" | "paused" | "mastered" | "struggled" | "skipped";
}

export interface Feedback {
  questionId: string;
  verdict: Verdict;
  feedbackMd: string;
  misconception?: string | null;
}

export interface Message {
  role: "user" | "tutor";
  kind: "side" | "note";
  text: string;
  created_at: number;
}

export interface LimitWindow {
  utilization: number; // 0..1
  resetsAt: number; // unix seconds
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  costUSD: number;
  lastContext: number;
  fiveHourDelta: number;
  limits: { fiveHour?: LimitWindow; sevenDay?: LimitWindow; status?: string; at: number } | null;
}

export interface Snapshot {
  id: string;
  set: { id: string; title: string };
  files: { id: string; name: string }[];
  mode: string;
  model: string | null;
  status: "active" | "finished";
  currentTopic: string | null;
  topics: Topic[];
  stack: Question[];
  current: Question | null;
  lastAttempt: { answer: string; verdict: Verdict | null; feedbackMd: string | null; misconception: string | null } | null;
  summaryMd: string | null;
  messages: Message[];
  busy: boolean;
  usage: Usage;
}

export interface StudySet {
  id: string;
  title: string;
  createdAt: number;
  files: string[];
  latest: { total: number; mastered: number | null; struggled: number | null } | null;
  sessions: { id: string; status: string; created_at: number; updated_at: number }[];
}

export interface Report extends Snapshot {
  questions: {
    id: string;
    topicKey: string;
    promptMd: string;
    depth: number;
    type: QuestionType;
    attempts: { answer: string | null; verdict: Verdict | null; misconception: string | null }[];
  }[];
}

export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Default (Sonnet 5.5)" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
];

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listSets: () => req<StudySet[]>("/sets"),
  createSet: (files: File[], title: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (title) form.append("title", title);
    return req<{ id: string }>("/sets", { method: "POST", body: form });
  },
  deleteSet: (id: string) => req("/sets/" + id, { method: "DELETE" }),
  fileUrl: (fileId: string) => `/api/sets/files/${fileId}`,

  startSession: (setId: string, model?: string) => req<{ id: string }>("/sessions", json("POST", { setId, model })),
  getSession: (id: string) => req<Snapshot>(`/sessions/${id}`),
  report: (id: string) => req<Report>(`/sessions/${id}/report`),
  answer: (id: string, questionId: string, answer: string) =>
    req(`/sessions/${id}/answer`, json("POST", { questionId, answer })),
  control: (id: string, kind: "CONFUSED" | "SKIP", questionId: string) =>
    req(`/sessions/${id}/control`, json("POST", { kind, questionId })),
  side: (id: string, text: string) => req(`/sessions/${id}/side`, json("POST", { text })),
  retry: (id: string) => req(`/sessions/${id}/retry`, { method: "POST" }),
  jumpTopic: (id: string, key: string) => req(`/sessions/${id}/topic`, json("POST", { key })),
};
