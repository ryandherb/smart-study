import clsx from "clsx";
import { ArrowRight, CheckCircle2, CircleAlert, HelpCircle, SkipForward, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { Feedback, Question } from "../lib/api";
import { Markdown } from "./Markdown";
import { Button, Kbd, ThinkingDots } from "./ui";

const STYLE = {
  correct: {
    icon: CheckCircle2,
    title: "Correct!",
    box: "border-emerald-500/30 bg-emerald-500/[0.07]",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  partial: {
    icon: CircleAlert,
    title: "Partially right",
    box: "border-amber-500/30 bg-amber-500/[0.07]",
    text: "text-amber-600 dark:text-amber-400",
  },
  incorrect: {
    icon: XCircle,
    title: "Not quite",
    box: "border-rose-500/30 bg-rose-500/[0.07]",
    text: "text-rose-600 dark:text-rose-400",
  },
};

export function YourAnswer({ answer, question }: { answer: string; question: Question }) {
  const md = question.type === "code" ? "```" + (question.language ?? "") + "\n" + answer + "\n```" : answer;
  return (
    <div className="rounded-xl bg-zinc-100/80 px-4 py-3 dark:bg-white/5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Your answer</div>
      <Markdown className="prose-sm">{md}</Markdown>
    </div>
  );
}

export function FeedbackCard({
  feedback,
  nextReady,
  onContinue,
  onConfused,
  onSkip,
}: {
  feedback: Feedback;
  nextReady: boolean;
  onContinue: () => void;
  onConfused: () => void;
  onSkip: () => void;
}) {
  const s = STYLE[feedback.verdict];
  const Icon = s.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, .cm-editor")) return;
      if ((e.key === "Enter" || e.key.toLowerCase() === "n") && nextReady) onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextReady, onContinue]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={clsx("rounded-2xl border p-5", s.box)}
    >
      <div className={clsx("mb-3 flex items-center gap-2 font-semibold", s.text)}>
        <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 12 }}>
          <Icon className="size-5" />
        </motion.span>
        {s.title}
        {feedback.misconception && feedback.verdict !== "correct" && (
          <span className="ml-2 truncate rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-black/20 dark:text-zinc-300">
            {feedback.misconception}
          </span>
        )}
      </div>
      <Markdown>{feedback.feedbackMd}</Markdown>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onContinue} disabled={!nextReady}>
          {nextReady ? (
            <>
              {feedback.verdict === "correct" ? "Continue" : "Try an easier step"} <ArrowRight className="size-4" />
              <Kbd>N</Kbd>
            </>
          ) : (
            <ThinkingDots label="Preparing next question" />
          )}
        </Button>
        {feedback.verdict === "correct" ? null : (
          <Button variant="ghost" onClick={onConfused} title="Ask the tutor to break it down further">
            <HelpCircle className="size-4" /> I'm still confused
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          <SkipForward className="size-4" /> Skip
        </Button>
      </div>
    </motion.div>
  );
}
