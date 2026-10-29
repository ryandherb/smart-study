import clsx from "clsx";
import { ChevronRight, CornerLeftUp, Mountain } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Question } from "../lib/api";

const label = (depth: number) => (depth === 0 ? "Original" : `Easier ${depth}`);
const preview = (md: string) =>
  md
    .replace(/[`$*#>_\\]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 140);

/** Original → Easier 1 → Easier 2 … showing where the student is in the scaffold. */
export function ScaffoldBreadcrumb({
  stack,
  current,
}: {
  stack: Question[];
  current: Question;
}) {
  const crumbs = [...stack, current];
  if (crumbs.length === 1) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-1 text-xs"
    >
      <Mountain className="mr-1 size-3.5 text-warning" />
      <AnimatePresence initial={false}>
        {crumbs.map((q, i) => {
          const last = i === crumbs.length - 1;
          return (
            <motion.span
              key={q.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-1"
            >
              {i > 0 && <ChevronRight className="size-3 text-study-muted" />}
              <span
                title={preview(q.promptMd)}
                className={clsx(
                  "rounded-md px-2.5 py-1 font-medium",
                  last
                    ? "bg-warning/15 text-warning ring-1 ring-warning/30 dark:text-warning"
                    : "bg-study-surface text-study-muted",
                )}
              >
                {label(i)}
              </span>
            </motion.span>
          );
        })}
      </AnimatePresence>
      <span className="ml-2 flex items-center gap-1 text-study-muted">
        <CornerLeftUp className="size-3" /> climb back to the original
      </span>
    </motion.div>
  );
}
