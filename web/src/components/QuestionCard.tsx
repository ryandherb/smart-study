import clsx from "clsx";
import { FileText } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { Question } from "../lib/api";
import { Markdown } from "./Markdown";

const TYPE_LABEL: Record<string, string> = {
  mcq: "Multiple choice",
  numeric: "Numeric",
  code: "Code",
  free: "Written",
};

export function Difficulty({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-0.5" title={`Difficulty ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-2.5 w-1.5 rounded-full",
            i <= value ? "bg-accent-500" : "bg-study-raised",
          )}
        />
      ))}
    </span>
  );
}

export function QuestionCard({
  question,
  topicTitle,
  onSource,
  children,
}: {
  question: Question;
  topicTitle?: string;
  onSource?: () => void;
  children?: ReactNode;
}) {
  const scaffold = question.depth > 0;
  return (
    <motion.article
      key={question.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={clsx(
        "question-content min-w-0",
        scaffold && "scaffold-question",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-6 text-xs text-study-muted">
        {topicTitle && (
          <span className="font-medium text-study-text">{topicTitle}</span>
        )}
        <span className="rounded-md bg-study-raised px-2 py-0.5">
          {TYPE_LABEL[question.type]}
        </span>
        {scaffold && (
          <span className="rounded-md bg-study-raised px-2 py-0.5 font-medium text-warning dark:text-warning">
            Stepping stone
          </span>
        )}
        <Difficulty value={question.difficulty} />
        <span className="flex-1" />
        {question.sourceRef && onSource && (
          <button
            onClick={onSource}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-study-surface hover:text-study-text"
          >
            <FileText className="size-3.5" />
            {question.sourceRef.file}
            {question.sourceRef.page ? ` · p.${question.sourceRef.page}` : ""}
          </button>
        )}
      </header>
      <div className="pb-8">
        <p className="mb-3 text-xs font-medium text-accent-500">
          {scaffold ? "Stepping-stone question" : "Question"}
        </p>
        <Markdown className="question-prose">{question.promptMd}</Markdown>
      </div>
      {children && <div className="pb-6">{children}</div>}
    </motion.article>
  );
}
