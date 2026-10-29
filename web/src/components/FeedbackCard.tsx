import clsx from "clsx";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  HelpCircle,
  PencilLine,
  SkipForward,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { Feedback, Question, TestResult } from "../lib/api";
import { Markdown } from "./Markdown";
import { TestChip } from "./TestResults";
import { Button, Kbd, ThinkingDots } from "./ui";

const STYLE = {
  correct: {
    icon: CheckCircle2,
    title: "Correct!",
    box: "border-study-line",
    text: "text-success dark:text-success",
  },
  partial: {
    icon: CircleAlert,
    title: "Partially right",
    box: "border-study-line",
    text: "text-warning dark:text-warning",
  },
  incorrect: {
    icon: XCircle,
    title: "Not quite",
    box: "border-study-line",
    text: "text-danger dark:text-danger",
  },
};

export function YourAnswer({
  answer,
  question,
}: {
  answer: string;
  question: Question;
}) {
  const md =
    question.type === "code"
      ? "```" + (question.language ?? "") + "\n" + answer + "\n```"
      : answer;
  return (
    <div className="rounded-md bg-study-surface px-4 py-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-study-muted">
        Your answer
      </div>
      <Markdown className="prose-sm">{md}</Markdown>
    </div>
  );
}

export function FeedbackCard({
  feedback,
  nextReady,
  retry,
  tests,
  onContinue,
  onConfused,
  onSkip,
}: {
  feedback: Feedback;
  nextReady: boolean;
  /** The tutor kept the same question open for a revised answer. */
  retry?: boolean;
  tests?: TestResult | null;
  onContinue: () => void;
  onConfused: () => void;
  onSkip: () => void;
}) {
  const s = STYLE[feedback.verdict];
  const Icon = s.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, .cm-editor"))
        return;
      if ((e.key === "Enter" || e.key.toLowerCase() === "n") && nextReady)
        onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextReady, onContinue]);

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={clsx("feedback-content border-t py-6", s.box)}
    >
      <div
        className={clsx("mb-3 flex items-center gap-2 font-semibold", s.text)}
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <Icon className="size-5" />
        </motion.span>
        {s.title}
        {tests && <TestChip result={tests} />}
        {feedback.misconception && feedback.verdict !== "correct" && (
          <span className="ml-2 truncate rounded-md bg-study-raised px-2.5 py-0.5 text-xs font-medium text-study-muted">
            {feedback.misconception}
          </span>
        )}
      </div>
      <Markdown>{feedback.feedbackMd}</Markdown>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onContinue} disabled={!nextReady}>
          {nextReady ? (
            <>
              {retry ? (
                <>
                  <PencilLine className="size-4" /> Revise your answer
                </>
              ) : (
                <>
                  {feedback.verdict === "correct"
                    ? "Continue"
                    : "Try an easier step"}{" "}
                  <ArrowRight className="size-4" />
                </>
              )}
              <Kbd>N</Kbd>
            </>
          ) : (
            <ThinkingDots label="Preparing next question" />
          )}
        </Button>
        {feedback.verdict === "correct" ? null : (
          <Button
            variant="ghost"
            onClick={onConfused}
            title="Ask the tutor to break it down further"
          >
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
