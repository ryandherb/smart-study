import clsx from "clsx";
import { ArrowLeft, BookOpen, FileText, MessageCircleQuestion, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnswerInput } from "../components/AnswerInput";
import { FeedbackCard, YourAnswer } from "../components/FeedbackCard";
import { QuestionCard } from "../components/QuestionCard";
import { ScaffoldBreadcrumb } from "../components/ScaffoldBreadcrumb";
import { SidePanel, type PanelTab } from "../components/SidePanel";
import { ProgressBar, TopicRail } from "../components/TopicRail";
import { Button, ThemeToggle, ThinkingDots } from "../components/ui";
import { api } from "../lib/api";
import { useStudy } from "../lib/store";

function Loading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card px-8 py-14 text-center">
      <div className="relative mx-auto mb-6 size-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent-500/20" />
        <div className="relative flex size-16 items-center justify-center rounded-full bg-accent-500/15">
          <BookOpen className="size-7 text-accent-500" />
        </div>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      <div className="mx-auto mt-8 max-w-md space-y-3">
        {[90, 75, 82].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-zinc-200 dark:bg-white/5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </motion.div>
  );
}

export default function Study() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { snap, pinned, feedback, scaffold, error, connect, submit, control, ask, continueOn, clearError } = useStudy();
  const [panel, setPanel] = useState<PanelTab | null>(null);

  useEffect(() => connect(id!), [id, connect]);

  if (!snap) {
    return (
      <div className="app-bg flex min-h-full items-center justify-center p-6">
        <ThinkingDots label="Connecting" />
      </div>
    );
  }

  const shown = pinned?.question ?? snap.current;
  const topic = snap.topics.find((t) => t.key === (shown?.topicKey ?? snap.currentTopic));
  const nextReady = !!pinned && (!snap.busy || snap.current?.id !== pinned.question.id);
  const lastNote = [...snap.messages].reverse().find((m) => m.kind === "note");
  const done = snap.topics.filter((t) => !["pending", "active"].includes(t.status)).length;
  const sourceTarget = shown?.sourceRef ?? null;
  const stack = pinned?.stack ?? snap.stack;

  return (
    <div className="app-bg flex h-full flex-col">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/70 backdrop-blur dark:border-white/5 dark:bg-zinc-950/60">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            <ArrowLeft className="size-4" /> Library
          </Link>
          <div className="h-5 w-px bg-zinc-200 dark:bg-white/10" />
          <h1 className="truncate font-semibold">{snap.set.title}</h1>
          {snap.topics.length > 0 && (
            <span className="hidden text-xs tabular-nums text-zinc-500 sm:inline">
              {done}/{snap.topics.length} topics
            </span>
          )}
          <span className="flex-1" />
          {snap.busy && <ThinkingDots label="Tutor is thinking" />}
          <Button variant={panel === "source" ? "secondary" : "ghost"} size="sm" onClick={() => setPanel(panel === "source" ? null : "source")}>
            <FileText className="size-4" /> <span className="hidden md:inline">Source</span>
          </Button>
          <Button variant={panel === "ask" ? "secondary" : "ghost"} size="sm" onClick={() => setPanel(panel === "ask" ? null : "ask")}>
            <MessageCircleQuestion className="size-4" /> <span className="hidden md:inline">Ask</span>
          </Button>
          <ThemeToggle />
        </div>
        {snap.topics.length > 0 && (
          <div className="px-4 pb-2">
            <ProgressBar topics={snap.topics} />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-4 py-6 lg:px-6">
        {/* topics */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto lg:block">
          {snap.topics.length > 0 && <TopicRail topics={snap.topics} />}
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 pb-24">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
                >
                  <span className="flex-1">{error}</span>
                  {!snap.busy && (
                    <Button size="sm" variant="ghost" onClick={() => (clearError(), api.retry(snap.id))}>
                      <RotateCcw className="size-4" /> Retry
                    </Button>
                  )}
                  <button onClick={clearError} aria-label="Dismiss">
                    <X className="size-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {snap.status === "finished" && !pinned ? (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card px-8 py-12 text-center">
                <Trophy className="mx-auto mb-4 size-12 text-amber-500" />
                <h2 className="text-2xl font-semibold">Session complete</h2>
                <p className="mt-2 text-zinc-500">You worked through all {snap.topics.length} topics.</p>
                <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate(`/study/${snap.id}/summary`)}>
                  View summary
                </Button>
              </motion.div>
            ) : !shown ? (
              snap.busy ? (
                <Loading title="Reading your material" subtitle="Claude is mapping out topics and writing your first question…" />
              ) : (
                <div className="card px-8 py-12 text-center text-zinc-500">
                  The tutor stopped before asking a question.
                  <div className="mt-4">
                    <Button variant="primary" onClick={() => api.retry(snap.id)}>
                      <RotateCcw className="size-4" /> Retry
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <>
                <ScaffoldBreadcrumb stack={stack} current={shown} />
                <AnimatePresence>
                  {scaffold?.direction === "down" && scaffold.reason && shown.depth > 0 && !pinned && (
                    <motion.div
                      key={scaffold.at}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200"
                    >
                      <span className="font-medium">Building up:</span> {scaffold.reason}
                    </motion.div>
                  )}
                </AnimatePresence>
                {!pinned && lastNote && (
                  <div className="flex items-start gap-2 px-1 text-sm text-zinc-500 dark:text-zinc-400">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-400" />
                    <span>{lastNote.text}</span>
                  </div>
                )}
                <AnimatePresence mode="wait">
                  <QuestionCard
                    key={shown.id}
                    question={shown}
                    topicTitle={topic?.title}
                    onSource={() => setPanel("source")}
                  >
                    {pinned ? (
                      <div className="space-y-4">
                        <YourAnswer answer={pinned.answer} question={pinned.question} />
                        {feedback ? (
                          <FeedbackCard
                            feedback={feedback}
                            nextReady={nextReady}
                            onContinue={continueOn}
                            onConfused={() => control("CONFUSED")}
                            onSkip={() => control("SKIP")}
                          />
                        ) : (
                          <ThinkingDots label="Grading your answer" />
                        )}
                      </div>
                    ) : (
                      <>
                        <AnswerInput question={shown} disabled={snap.busy} onSubmit={submit} />
                        <div className={clsx("mt-3 flex justify-end gap-1", snap.busy && "pointer-events-none opacity-50")}>
                          <Button variant="ghost" size="sm" onClick={() => control("CONFUSED")}>
                            I don't know where to start
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => control("SKIP")}>
                            Skip
                          </Button>
                        </div>
                      </>
                    )}
                  </QuestionCard>
                </AnimatePresence>
              </>
            )}
          </div>
        </main>

        {/* side panel */}
        <AnimatePresence>
          {panel && (
            <motion.div
              initial={{ opacity: 0, x: 24, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 440 }}
              exit={{ opacity: 0, x: 24, width: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="hidden shrink-0 md:block"
            >
              <div className="h-[calc(100vh-7.5rem)] w-[440px]">
                <SidePanel
                  tab={panel}
                  setTab={setPanel}
                  onClose={() => setPanel(null)}
                  files={snap.files}
                  target={sourceTarget}
                  messages={snap.messages}
                  busy={snap.busy}
                  onAsk={ask}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
