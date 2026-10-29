import clsx from "clsx";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  CirclePause,
  CircleSlash,
  TriangleAlert,
} from "lucide-react";
import { motion } from "motion/react";
import type { Topic } from "../lib/api";

const ICON = {
  pending: { icon: Circle, cls: "text-study-muted" },
  active: { icon: CircleDot, cls: "text-accent-500" },
  paused: { icon: CirclePause, cls: "text-accent-300 dark:text-accent-400/70" },
  mastered: { icon: CheckCircle2, cls: "text-success" },
  struggled: { icon: TriangleAlert, cls: "text-warning" },
  skipped: { icon: CircleSlash, cls: "text-study-muted" },
};

export function ProgressBar({ topics }: { topics: Topic[] }) {
  return (
    <div className="flex h-1.5 w-full gap-1">
      {topics.map((t) => (
        <div
          key={t.key}
          className="relative flex-1 overflow-hidden rounded-full bg-study-raised"
          title={t.title}
        >
          <motion.div
            initial={false}
            animate={{
              width:
                t.status === "pending"
                  ? "0%"
                  : t.status === "active"
                    ? "45%"
                    : t.status === "paused"
                      ? "30%"
                      : "100%",
            }}
            transition={{ duration: 0.15 }}
            className={clsx(
              "absolute inset-y-0 left-0 rounded-full",
              t.status === "mastered" && "bg-success",
              t.status === "struggled" && "bg-warning",
              t.status === "skipped" && "bg-study-muted",
              t.status === "active" && "bg-accent-500",
              t.status === "paused" && "bg-accent-300 dark:bg-accent-400/60",
            )}
          />
        </div>
      ))}
    </div>
  );
}

const HINT: Record<Topic["status"], string> = {
  pending: "Start this topic",
  active: "Current topic",
  paused: "Resume where you left off",
  mastered: "Review this topic",
  struggled: "Try this topic again",
  skipped: "Go back to this topic",
};

/** Topic list; click any topic to jump there (the current one is paused and keeps its place). */
export function TopicRail({
  topics,
  current,
  busy,
  onSelect,
}: {
  topics: Topic[];
  current: string | null;
  busy: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <nav aria-label="Study topics" className="space-y-0.5">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-study-muted">
        Topics
      </div>
      {topics.map((t) => {
        const isCurrent = t.key === current;
        const { icon: Icon, cls } = ICON[isCurrent ? "active" : t.status];
        return (
          <motion.button
            key={t.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`${t.title}: ${isCurrent ? "current" : t.status}`}
            disabled={isCurrent || busy}
            onClick={() => onSelect(t.key)}
            title={
              isCurrent
                ? HINT.active
                : busy
                  ? "Wait for the tutor to finish"
                  : HINT[t.status]
            }
            className={clsx(
              "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
              isCurrent
                ? "cursor-default bg-study-raised font-medium text-study-text"
                : "text-study-muted enabled:hover:bg-study-surface enabled:hover:text-study-text disabled:cursor-wait",
            )}
          >
            <Icon className={clsx("mt-0.5 size-4 shrink-0", cls)} />
            <span className="leading-snug">{t.title}</span>
          </motion.button>
        );
      })}
      <div className="mt-6 border-t border-study-line px-2 pt-4 text-xs text-study-muted">
        {
          topics.filter((t) =>
            ["mastered", "struggled", "skipped"].includes(t.status),
          ).length
        }{" "}
        of {topics.length} completed
        <div className="mt-3">
          <ProgressBar topics={topics} />
        </div>
      </div>
    </nav>
  );
}
