import type { ModelUsage, SDKRateLimitInfo } from "@anthropic-ai/claude-agent-sdk";
import { getSession, updateSession } from "../db/repo";

export interface LimitWindow {
  utilization: number; // 0..1
  resetsAt: number; // unix seconds
}

export interface AccountLimits {
  fiveHour?: LimitWindow;
  sevenDay?: LimitWindow;
  status?: string;
  at: number; // ms timestamp of the reading
}

export interface SessionUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUSD: number;
  /** Prompt size of the most recent model call: roughly what every further call re-sends. */
  lastContext: number;
  /** Sum of rises in 5-hour utilization seen during this session (account-wide, so includes other Claude use). */
  fiveHourDelta: number;
  lastFiveHour?: LimitWindow;
  limits?: AccountLimits;
  /** Running totals of the current SDK conversation, to turn its cumulative results into increments. */
  conversation?: Pick<SessionUsage, "input" | "output" | "cacheRead" | "cacheWrite" | "costUSD">;
}

const empty = (): SessionUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUSD: 0,
  lastContext: 0,
  fiveHourDelta: 0,
});

/** Latest subscription limits seen by any session in this process. */
let latestLimits: AccountLimits | undefined;

export function loadUsage(sessionId: string): SessionUsage {
  const raw = getSession(sessionId)?.usage;
  return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
}

const save = (sessionId: string, u: SessionUsage) => updateSession(sessionId, { usage: JSON.stringify(u) });

/** What the UI shows: the session's totals plus the freshest account limits available. */
export function usageView(sessionId: string) {
  const u = loadUsage(sessionId);
  const limits = [latestLimits, u.limits].filter(Boolean).sort((a, b) => b!.at - a!.at)[0] ?? null;
  const { lastFiveHour, limits: _, conversation, ...totals } = u;
  return { ...totals, total: u.input + u.output + u.cacheRead + u.cacheWrite, limits };
}

type Totals = Pick<SessionUsage, "input" | "output" | "cacheRead" | "cacheWrite" | "costUSD">;
const zero = (): Totals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 });

/** Call when a new SDK conversation starts (planning, or a new topic): its running totals start from zero. */
export function resetConversation(sessionId: string) {
  const u = loadUsage(sessionId);
  u.conversation = zero();
  save(sessionId, u);
}

/**
 * A result's modelUsage/total_cost_usd are running totals for the current conversation
 * (carried over when it is resumed), so add only the increase since the last result.
 */
export function recordResult(sessionId: string, modelUsage: Record<string, ModelUsage>, costUSD: number) {
  const models = Object.values(modelUsage);
  if (!models.length) return;
  const sum = (k: keyof ModelUsage) => models.reduce((n, m) => n + ((m[k] as number) ?? 0), 0);
  const now: Totals = {
    input: sum("inputTokens"),
    output: sum("outputTokens"),
    cacheRead: sum("cacheReadInputTokens"),
    cacheWrite: sum("cacheCreationInputTokens"),
    costUSD,
  };
  const u = loadUsage(sessionId);
  const prev = u.conversation ?? zero();
  for (const k of Object.keys(now) as (keyof Totals)[]) {
    // A drop means the running total restarted (e.g. resumed without saved totals): count it all.
    u[k] += now[k] >= prev[k] ? now[k] - prev[k] : now[k];
  }
  u.conversation = now;
  save(sessionId, u);
}

export function recordContext(sessionId: string, usage: { input_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined) {
  if (!usage) return;
  const ctx = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  if (!ctx) return;
  const u = loadUsage(sessionId);
  u.lastContext = ctx;
  save(sessionId, u);
}

export function recordRateLimit(sessionId: string, info: SDKRateLimitInfo) {
  const windows = (info as any).unifiedWindows as Record<string, { utilization?: number; resetsAt?: number }> | undefined;
  const win = (key: string): LimitWindow | undefined => {
    const w = windows?.[key];
    if (w?.utilization != null && w.resetsAt) return { utilization: w.utilization, resetsAt: w.resetsAt };
    // Older shape: only the window that triggered the event.
    if (info.rateLimitType === key && info.utilization != null && info.resetsAt)
      return { utilization: info.utilization, resetsAt: info.resetsAt };
  };
  const fiveHour = win("five_hour");
  const sevenDay = win("seven_day");
  if (!fiveHour && !sevenDay) return;

  latestLimits = {
    fiveHour: fiveHour ?? latestLimits?.fiveHour,
    sevenDay: sevenDay ?? latestLimits?.sevenDay,
    status: info.status,
    at: Date.now(),
  };
  const u = loadUsage(sessionId);
  if (fiveHour) {
    const prev = u.lastFiveHour;
    if (prev && prev.resetsAt === fiveHour.resetsAt) u.fiveHourDelta += Math.max(0, fiveHour.utilization - prev.utilization);
    else if (prev) u.fiveHourDelta += fiveHour.utilization; // window rolled over: everything in the new window is new
    u.lastFiveHour = fiveHour;
  }
  u.limits = latestLimits;
  save(sessionId, u);
}
