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
            i <= value ? "bg-accent-500" : "bg-zinc-200 dark:bg-white/10",
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
      initial={{ opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={clsx("card overflow-hidden", scaffold && "ring-1 ring-amber-500/25")}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-6 py-3 text-xs text-zinc-500 dark:border-white/5 dark:text-zinc-400">
        {topicTitle && <span className="font-medium text-zinc-700 dark:text-zinc-200">{topicTitle}</span>}
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-white/5">{TYPE_LABEL[question.type]}</span>
        {scaffold && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
            Stepping stone
          </span>
        )}
        <Difficulty value={question.difficulty} />
        <span className="flex-1" />
        {question.sourceRef && onSource && (
          <button
            onClick={onSource}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/5 dark:hover:text-zinc-100"
          >
            <FileText className="size-3.5" />
            {question.sourceRef.file}
            {question.sourceRef.page ? ` · p.${question.sourceRef.page}` : ""}
          </button>
        )}
      </header>
      <div className="px-6 py-6 sm:px-8">
        <Markdown className="text-[1.05rem] leading-relaxed">{question.promptMd}</Markdown>
      </div>
      {children && <div className="px-6 pb-6 sm:px-8">{children}</div>}
    </motion.article>
  );
}
