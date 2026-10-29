import clsx from "clsx";
import { Gauge, Info } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import type { LimitWindow, Usage } from "../lib/api";

const fmtTokens = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
    : n >= 1e3
      ? `${Math.round(n / 1e3)}k`
      : `${n}`;

const pct = (x: number) => `${Math.round(x * 100)}%`;

function fmtReset(resetsAt: number) {
  const d = new Date(resetsAt * 1000);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { weekday: "short", hour: "numeric" });
}

const tone = (u: number) =>
  u >= 0.8 ? "bg-danger" : u >= 0.5 ? "bg-warning" : "bg-success";

function Meter({
  label,
  w,
  quizShare,
}: {
  label: string;
  w?: LimitWindow;
  quizShare?: number;
}) {
  if (!w) return null;
  const u = Math.min(1, w.utilization);
  const share = Math.min(u, quizShare ?? 0);
  return (
    <div
      className="flex items-center gap-2"
      title={`${label}: ${pct(u)} used · resets ${fmtReset(w.resetsAt)}`}
    >
      <span className="text-study-muted">{label}</span>
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-study-raised">
        <motion.div
          initial={false}
          animate={{ width: pct(u) }}
          className={clsx("absolute inset-y-0 left-0 rounded-full", tone(u))}
        />
        {share > 0 && (
          // The part of the bar used since this quiz started, striped on top of the total.
          <motion.div
            initial={false}
            animate={{ left: pct(u - share), width: pct(share) }}
            className="absolute inset-y-0 border-l-2 border-study-text"
          />
        )}
      </div>
      <span className="tabular-nums font-medium">{pct(u)}</span>
      <span className="hidden text-study-muted xl:inline">
        · resets {fmtReset(w.resetsAt)}
      </span>
    </div>
  );
}

/** Fixed footer showing what the current quiz has used and where the subscription limits stand. */
export function UsageBar({
  usage,
  busy,
  provider = "claude",
}: {
  usage: Usage;
  busy: boolean;
  provider?: "claude" | "chatgpt";
}) {
  const [expanded, setExpanded] = useState(false);
  const cached = usage.total ? usage.cacheRead / usage.total : 0;
  const limits = usage.limits;
  const detail = [
    `Tokens processed this quiz: ${usage.total.toLocaleString()}`,
    `  cache reads: ${usage.cacheRead.toLocaleString()} (${pct(cached)})`,
    `  cache writes: ${usage.cacheWrite.toLocaleString()}`,
    `  uncached input: ${usage.input.toLocaleString()} · output: ${usage.output.toLocaleString()}`,
    `Each call currently re-sends ~${fmtTokens(usage.lastContext)} tokens (PDFs + conversation).`,
    provider === "chatgpt"
      ? "ChatGPT plan limits and cost estimates are not reported by Codex CLI."
      : `API-equivalent cost estimate: $${usage.costUSD.toFixed(2)} (your subscription isn't billed this; it's a size gauge).`,
    limits
      ? `\nLimits are account-wide, as of ${new Date(limits.at).toLocaleTimeString()}.`
      : "",
    usage.fiveHourDelta > 0
      ? `"This quiz" share = rise in 5-hour usage since the quiz started, so it includes any other Claude use in that time.`
      : "",
  ].join("\n");

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-study-line bg-study-surface">
      {expanded && (
        <div
          id="usage-details"
          className="max-h-64 overflow-y-auto border-b border-study-line p-4 text-xs leading-relaxed whitespace-pre-line"
        >
          {detail}
        </div>
      )}
      <div className="flex h-10 items-center gap-5 overflow-x-auto px-4 text-xs whitespace-nowrap [scrollbar-width:none]">
        <div className="flex items-center gap-2" title={detail}>
          <Gauge
            className={clsx(
              "size-4",
              busy ? "text-accent-500" : "text-study-muted",
            )}
          />
          <span className="text-study-muted">This quiz</span>
          <span className="font-medium tabular-nums">
            {fmtTokens(usage.total)} tokens
          </span>
          <button
            aria-label="Usage details"
            aria-expanded={expanded}
            aria-controls="usage-details"
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-study-muted hover:text-study-text"
          >
            <Info className="size-3.5" />
          </button>
        </div>

        <span className="flex-1" />
        {limits &&
          [limits.fiveHour, limits.sevenDay].some(
            (w) => w && w.utilization >= 0.8,
          ) && (
            <span className="text-warning">
              Plan usage is high · check reset time
            </span>
          )}

        {limits ? (
          <>
            {usage.fiveHourDelta > 0 && (
              <span
                className="text-study-muted"
                title="Rise in your 5-hour usage since this quiz started (includes any other Claude use)."
              >
                +{pct(usage.fiveHourDelta)} since quiz start
              </span>
            )}
            <Meter
              label="5-hour"
              w={limits.fiveHour}
              quizShare={usage.fiveHourDelta}
            />
            <Meter label="Weekly" w={limits.sevenDay} />
          </>
        ) : (
          <span className="text-study-muted">
            {provider === "chatgpt"
              ? "ChatGPT plan limits are available in Codex"
              : "Plan limits appear after the tutor's next reply"}
          </span>
        )}
      </div>
    </footer>
  );
}
