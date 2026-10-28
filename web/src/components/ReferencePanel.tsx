import clsx from "clsx";
import { Check, Eye } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type Question, type Reference } from "../lib/api";
import { Markdown } from "./Markdown";
import { Button } from "./ui";

/** "Show solution": reveals the hidden reference and rubric (no model call) as a self-check checklist. */
export function ReferencePanel({ sessionId, question }: { sessionId: string; question: Question }) {
  const [ref, setRef] = useState<Reference | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRef(null);
    setChecked(new Set());
    setErr(null);
  }, [question.id]);

  if (!question.hasReference) return null;

  if (!ref) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          if (!confirm("Show the reference solution? The tutor will know you looked.")) return;
          try {
            setRef(await api.reveal(sessionId, question.id));
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
        title={err ?? undefined}
      >
        <Eye className="size-4" /> Show solution
      </Button>
    );
  }

  const toggle = (i: number) =>
    setChecked((cur) => {
      const next = new Set(cur);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 w-full rounded-2xl border border-sky-500/25 bg-sky-500/[0.05] p-5 text-left"
    >
      {ref.rubric.length > 0 && (
        <>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Self-check ({checked.size}/{ref.rubric.length})
          </div>
          <ul className="mb-4 space-y-1.5">
            {ref.rubric.map((r, i) => (
              <li key={i}>
                <button onClick={() => toggle(i)} className="flex items-start gap-2.5 text-left text-sm">
                  <span
                    className={clsx(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      checked.has(i) ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 dark:border-white/20",
                    )}
                  >
                    {checked.has(i) && <Check className="size-3" />}
                  </span>
                  <Markdown className="prose-sm">{r}</Markdown>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Reference solution</div>
      <Markdown className="prose-sm">{ref.referenceMd}</Markdown>
    </motion.div>
  );
}
