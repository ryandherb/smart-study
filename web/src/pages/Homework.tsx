import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { UsageBar } from "../components/UsageBar";
import { Button, ThemeToggle } from "../components/ui";
async function request(path: string, body?: unknown) {
  const r = await fetch(
    "/api/homework/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function Homework() {
  const { id } = useParams();
  const [snap, setSnap] = useState<any>();
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, select] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => request(id!).then(setSnap);
  useEffect(() => {
    let alive = true;
    const update = (data: any) => {
      if (!alive) return;
      setSnap(data);
      select((current) =>
        data.problems.some((p: any) => p.id === current)
          ? current
          : (data.problems[0]?.id ?? ""),
      );
    };
    request(id!)
      .then(update)
      .catch((e) => setError(e.message));
    const es = new EventSource("/api/homework/" + id + "/events");
    es.addEventListener("snapshot", (e) =>
      update(JSON.parse((e as MessageEvent).data)),
    );
    es.onerror = () => setError("Connection interrupted. Reconnecting…");
    es.onopen = () => setError("");
    return () => {
      alive = false;
      es.close();
    };
  }, [id]);
  const perform = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const problem = snap?.problems.find((p: any) => p.id === selected);
  const input = "w-full rounded-md border p-3 bg-transparent";
  return (
    <main className="mx-auto max-w-5xl p-6 pb-24 space-y-5">
      <header className="flex items-center justify-between border-b border-study-line pb-4">
        <Link to="/">← Library</Link>
        <ThemeToggle />
      </header>
      <h1 className="text-2xl font-semibold">
        {snap?.title || "Math homework"}
      </h1>
      {snap?.usage && (
        <UsageBar
          usage={snap.usage}
          busy={busy || snap.busy}
          provider={snap.provider}
        />
      )}
      <p>
        Enter a problem and your final answer. Use plain notation or LaTeX
        ($…$).
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {snap?.problems.map((p: any, i: number) => (
          <Button
            key={p.id}
            onClick={() => {
              select(p.id);
              setAnswer("");
              setEditing(null);
            }}
          >
            Problem {i + 1}
            {p.history.some((h: any) => h.verdict === "correct") ? " ✓" : ""}
            {p.history.some((h: any) => h.kind === "reveal_solution")
              ? " · revealed"
              : ""}
          </Button>
        ))}
      </div>
      <section className="card p-5 space-y-3">
        <label className="answer-label" htmlFor="problem">
          New problem
        </label>
        <textarea
          id="problem"
          className={input}
          rows={3}
          maxLength={10000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Markdown>{prompt}</Markdown>
        <Button
          variant="primary"
          disabled={busy || !prompt.trim()}
          onClick={() =>
            perform(async () => {
              const p = await request(id + "/problems", { prompt });
              select(p.id);
              setPrompt("");
              setAnswer("");
            })
          }
        >
          Add problem
        </Button>
      </section>
      {problem && (
        <section className="card p-5 space-y-4">
          <Markdown>{problem.prompt}</Markdown>
          <Button
            disabled={busy || snap.busy}
            onClick={() => setEditing(problem.prompt)}
          >
            Edit problem
          </Button>
          {editing !== null && (
            <div className="space-y-3">
              <label className="answer-label" htmlFor="edit-problem">
                Edit problem (resets attempts and help)
              </label>
              <textarea
                id="edit-problem"
                className={input}
                value={editing}
                maxLength={10000}
                onChange={(e) => setEditing(e.target.value)}
              />
              <Markdown>{editing}</Markdown>
              <Button
                disabled={busy || snap.busy || !editing.trim()}
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset this problem’s attempts and revealed help?",
                    )
                  )
                    void perform(async () => {
                      await request(id + "/problems/" + problem.id, {
                        prompt: editing,
                        reset: true,
                      });
                      setEditing(null);
                      setAnswer("");
                    });
                }}
              >
                Save and reset
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          )}
          {problem.history.map((h: any, i: number) => (
            <article key={i} className="border-t pt-4">
              {h.answer && (
                <>
                  <p className="font-medium">Your answer</p>
                  <Markdown>{h.answer}</Markdown>
                </>
              )}
              <p className="text-sm font-medium">
                {h.verdict || h.kind.replaceAll("_", " ")}
              </p>
              <Markdown>{h.text}</Markdown>
            </article>
          ))}
          <label className="answer-label" htmlFor="answer">
            Final answer
          </label>
          <textarea
            id="answer"
            className={input}
            value={answer}
            maxLength={10000}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Markdown>{answer}</Markdown>
          <div className="flex flex-wrap gap-2">
            {[
              ["check", "Check answer"],
              ["hint", "Hint"],
              ["next_step", "Next step"],
              ["reveal_solution", "Reveal solution"],
            ].map(([kind, label]) => (
              <Button
                variant={kind === "check" ? "primary" : "secondary"}
                key={kind}
                disabled={
                  busy ||
                  snap.busy ||
                  (kind === "check" && !answer.trim()) ||
                  (kind === "next_step" &&
                    problem.stepCount !== null &&
                    problem.stepIndex >= problem.stepCount) ||
                  (kind === "reveal_solution" &&
                    problem.history.some(
                      (h: any) => h.kind === "reveal_solution",
                    ))
                }
                onClick={() =>
                  perform(() =>
                    request(id + "/action", {
                      problemId: problem.id,
                      kind,
                      answer,
                    }),
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
          {busy && <p role="status">Tutor is thinking…</p>}
        </section>
      )}
    </main>
  );
}
