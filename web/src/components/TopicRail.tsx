import clsx from "clsx";
import { CheckCircle2, Circle, CircleDot, CircleSlash, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import type { Topic } from "../lib/api";

const ICON = {
  pending: { icon: Circle, cls: "text-zinc-300 dark:text-zinc-600" },
  active: { icon: CircleDot, cls: "text-accent-500" },
  mastered: { icon: CheckCircle2, cls: "text-emerald-500" },
  struggled: { icon: TriangleAlert, cls: "text-amber-500" },
  skipped: { icon: CircleSlash, cls: "text-zinc-400" },
};

export function ProgressBar({ topics }: { topics: Topic[] }) {
  return (
    <div className="flex h-1.5 w-full gap-1">
      {topics.map((t) => (
        <div key={t.key} className="relative flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" title={t.title}>
          <motion.div
            initial={false}
            animate={{
              width: t.status === "pending" ? "0%" : t.status === "active" ? "45%" : "100%",
            }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={clsx(
              "absolute inset-y-0 left-0 rounded-full",
              t.status === "mastered" && "bg-emerald-500",
              t.status === "struggled" && "bg-amber-500",
              t.status === "skipped" && "bg-zinc-400",
              t.status === "active" && "bg-accent-500",
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function TopicRail({ topics }: { topics: Topic[] }) {
  return (
    <nav className="space-y-0.5">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Topics</div>
      {topics.map((t, i) => {
        const { icon: Icon, cls } = ICON[t.status];
        return (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={clsx(
              "flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-sm",
              t.status === "active" && "bg-accent-500/10 font-medium text-zinc-900 dark:text-white",
              t.status !== "active" && "text-zinc-600 dark:text-zinc-400",
            )}
          >
            <Icon className={clsx("mt-0.5 size-4 shrink-0", cls)} />
            <span className="leading-snug">{t.title}</span>
          </motion.div>
        );
      })}
    </nav>
  );
}
