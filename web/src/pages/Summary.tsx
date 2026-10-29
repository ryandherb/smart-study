import { Recommendation } from "../components/Recommendation";
import clsx from "clsx";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { Button, ThemeToggle, ThinkingDots } from "../components/ui";
import { api, type Report } from "../lib/api";

const VERDICT_ICON = {
  correct: <CheckCircle2 className="size-4 text-success" />,
  partial: <CircleAlert className="size-4 text-warning" />,
  incorrect: <XCircle className="size-4 text-danger" />,
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="card px-5 py-4">
      <div className={clsx("text-2xl font-semibold tabular-nums", tone)}>
        {value}
      </div>
      <div className="text-xs text-study-muted">{label}</div>
    </div>
  );
}

export default function Summary() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Report | null>(null);
  const navigate = useNavigate();
  useEffect(() => void api.report(id!).then(setR), [id]);

  if (!r) {
    return (
      <div className="app-bg flex min-h-full items-center justify-center">
        <ThinkingDots label="Loading" />
      </div>
    );
  }

  const graded = r.questions.flatMap((q) =>
    q.attempts.filter((a) => a.verdict),
  );
  const firstTry = r.questions.filter(
    (q) => q.depth === 0 && q.attempts[0]?.verdict === "correct",
  ).length;
  const topLevel = r.questions.filter(
    (q) => q.depth === 0 && q.attempts.some((a) => a.verdict),
  ).length;
  const misconceptions = [
    ...new Set(graded.map((a) => a.misconception).filter(Boolean)),
  ] as string[];
  const scaffolds = r.questions.filter((q) => q.depth > 0).length;

  return (
    <div className="app-bg min-h-full">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-study-muted hover:text-study-text"
          >
            <ArrowLeft className="size-4" /> Library
          </Link>
          <span className="flex-1" />
          {r.status === "active" && (
            <Button size="sm" onClick={() => navigate(`/study/${r.id}`)}>
              Back to session
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={async () =>
              navigate(
                `/study/${(await api.startSession(r.set.id, r.model ?? undefined, r.mode, r.provider)).id}`,
              )
            }
          >
            <RotateCcw className="size-4" /> Study again
          </Button>
          <ThemeToggle />
        </header>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-semibold tracking-tight"
        >
          {r.set.title}
        </motion.h1>
        <p className="mt-1 text-study-muted">Session summary</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Topics mastered"
            value={`${r.topics.filter((t) => t.status === "mastered").length}/${r.topics.length}`}
            tone="text-success"
          />
          <Stat label="Right first try" value={`${firstTry}/${topLevel}`} />
          <Stat
            label="Stepping-stone questions"
            value={scaffolds}
            tone="text-warning"
          />
          <Stat label="Answers graded" value={graded.length} />
        </div>

        {r.status === "finished" && (
          <Recommendation
            setId={r.set.id}
            provider={localStorage.getItem("study-provider") ?? r.provider}
          />
        )}

        {r.summaryMd && (
          <section className="card mt-6 p-6">
            <Markdown>{r.summaryMd}</Markdown>
          </section>
        )}

        {misconceptions.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-study-muted">
              Misconceptions to review
            </h2>
            <div className="flex flex-wrap gap-2">
              {misconceptions.map((m) => (
                <span
                  key={m}
                  className="rounded-md border border-warning/30 bg-warning/10 px-3 py-1 text-sm text-warning dark:text-warning"
                >
                  {m}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold text-study-muted">By topic</h2>
          {r.topics.map((t) => {
            const qs = r.questions.filter((q) => q.topicKey === t.key);
            return (
              <div key={t.key} className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="flex-1 font-semibold">{t.title}</h3>
                  <span
                    className={clsx(
                      "rounded-md px-2.5 py-0.5 text-xs font-medium capitalize",
                      t.status === "mastered" &&
                        "bg-success/15 text-success dark:text-success",
                      t.status === "struggled" &&
                        "bg-warning/15 text-warning dark:text-warning",
                      !["mastered", "struggled"].includes(t.status) &&
                        "bg-study-surface text-study-muted",
                    )}
                  >
                    {t.status}
                  </span>
                </div>
                {qs.length === 0 ? (
                  <p className="text-sm text-study-muted">Not reached.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {qs.map((q) => {
                      const v = q.attempts.find((a) => a.verdict)?.verdict;
                      return (
                        <li
                          key={q.id}
                          className="flex items-start gap-2 text-sm"
                          style={{ paddingLeft: q.depth * 20 }}
                        >
                          <span className="mt-0.5">
                            {v ? (
                              VERDICT_ICON[v]
                            ) : (
                              <span className="inline-block size-4 rounded-full border border-study-line" />
                            )}
                          </span>
                          <span className="line-clamp-1 text-study-muted">
                            {q.promptMd
                              .replace(/```[\s\S]*?```/g, "[code]")
                              .replace(/\*\*/g, "")
                              .replace(/[$`#]/g, "")
                              .slice(0, 160)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
