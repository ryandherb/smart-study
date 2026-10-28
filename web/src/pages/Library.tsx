import clsx from "clsx";
import { FileText, GraduationCap, PencilLine, Play, Plus, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ThemeToggle } from "../components/ui";
import { api, MODELS, MODES, type ProviderStatus, type StudySet } from "../lib/api";
import { formatStudyTime } from "../components/StudyTimer";

function MasteryRing({ mastered, struggled, total }: { mastered: number; struggled: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const m = total ? mastered / total : 0;
  const s = total ? struggled / total : 0;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-zinc-200 dark:stroke-white/10" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-amber-500"
          strokeDasharray={`${(m + s) * c} ${c}`} />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-emerald-500"
          strokeDasharray={`${m * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {total ? `${Math.round(m * 100)}%` : "–"}
      </span>
    </div>
  );
}

function NewSet({ onCreated, provider, ready }: { onCreated: () => void; provider: string; ready: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("adaptive");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const add = (list: FileList | null) => {
    const pdfs = Array.from(list ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setFiles((cur) => [...cur, ...pdfs]);
    if (!title && pdfs[0]) setTitle(pdfs[0].name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
  };

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const set = await api.createSet(files, title);
      const s = await api.startSession(set.id, provider === "claude" ? model || undefined : undefined, mode, provider);
      onCreated();
      navigate(`/study/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), add(e.dataTransfer.files))}
        onClick={() => input.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          drag
            ? "border-accent-500 bg-accent-500/10"
            : "border-zinc-200 hover:border-accent-300 hover:bg-zinc-50 dark:border-white/10 dark:hover:border-accent-400/40 dark:hover:bg-white/[0.03]",
        )}
      >
        <motion.div animate={{ y: drag ? -4 : 0 }}>
          <UploadCloud className="mb-3 size-10 text-accent-500" />
        </motion.div>
        <div className="font-medium">Drop practice exams or lecture slides</div>
        <div className="mt-1 text-sm text-zinc-500">PDF files, up to 30 MB each</div>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            <ul className="mt-4 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-zinc-100/70 px-3 py-2 text-sm dark:bg-white/5">
                  <FileText className="size-4 text-zinc-400" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-zinc-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove">
                    <X className="size-4 text-zinc-400 hover:text-zinc-700" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Set name, e.g. CS 201 Midterm"
                className="h-10 min-w-48 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-accent-500 dark:border-white/10 dark:bg-zinc-950/50"
              />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-zinc-950/50"
                title={MODES.find((m) => m.id === mode)?.hint}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {provider === "claude" && <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-zinc-950/50"
                title="Model"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              }
              <Button variant="primary" onClick={start} disabled={busy || !ready}>
                <Play className="size-4" /> {busy ? "Starting…" : "Start studying"}
              </Button>
            </div>
            {err && <div className="mt-3 text-sm text-rose-500">{err}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Library() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [provider, setProvider] = useState(() => localStorage.getItem("study-provider") ?? "claude");
  const [providerError, setProviderError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const refreshProviders = () => {
    setProviderError("");
    api.providers().then(items => {
      setProviders(items);
      setProvider(current => {
        if (items.some(p => p.id === current && p.available)) return current;
        const next = items.find(p => p.available)?.id ?? current;
        localStorage.setItem("study-provider", next);
        return next;
      });
    }).catch(e => setProviderError(e.message));
  };
  useEffect(refreshProviders, []);
  const ready = providers.some(p => p.id === provider && p.available);
  const [sets, setSets] = useState<StudySet[] | null>(null);
  const navigate = useNavigate();
  const load = () => api.listSets().then(setSets);
  useEffect(() => void load(), []);

  const newSession = async (setId: string, mode?: string) => {
    setSessionError("");
    try {
      const s = await api.startSession(setId, undefined, mode, provider);
      navigate(`/study/${s.id}`);
    } catch (e) { setSessionError((e as Error).message); }
  };

  return (
    <div className="app-bg min-h-full">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-lg shadow-accent-500/30">
            <GraduationCap className="size-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Study Claude</h1>
            <p className="text-sm text-zinc-500">One question at a time. Easier steps until the hard one clicks.</p>
          </div>
          <ThemeToggle />
        </header>

        <section className="card mb-6 p-5" aria-label="AI service settings">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="provider" className="text-sm font-medium">Quiz service</label>
            <select id="provider" value={provider} onChange={e => {
              setProvider(e.target.value); localStorage.setItem("study-provider", e.target.value);
            }} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950">
              {!providers.length && <option value={provider}>Checking connections…</option>}
              {providers.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.label}{p.available ? " · connected" : " · setup needed"}</option>)}
            </select>
            <Button size="sm" onClick={refreshProviders}>Refresh connections</Button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Used for new sessions. Existing sessions keep their service.</p>
          {providers.map(p => <p key={p.id} className="mt-1 text-xs text-zinc-500">{p.label}: {p.hint}</p>)}
          {(providerError || sessionError) && <p role="alert" className="mt-2 text-sm text-rose-500">{providerError || sessionError}</p>}
        </section>
        <section className="mb-12">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-500">
            <Plus className="size-4" /> New study set
          </h2>
          <NewSet onCreated={load} provider={provider} ready={ready} />
        </section>

        {sets && sets.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-500">Your study sets</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sets.map((s, i) => {
                const active = s.sessions.find((x) => x.status === "active");
                const latest = s.sessions[0];
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="card group flex flex-col p-5 transition hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <MasteryRing
                        mastered={s.latest?.mastered ?? 0}
                        struggled={s.latest?.struggled ?? 0}
                        total={s.latest?.total ?? 0}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{s.title}</h3>
                        <p className="truncate text-xs text-zinc-500">{s.files.join(", ")}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {s.latest?.total ? `${s.latest.total} topics · ` : ""}
                          {s.sessions.length} session{s.sessions.length === 1 ? "" : "s"}
                          {" · "}{formatStudyTime(s.studyTimeMs)} studied
                          {" · "}
                          {latest?.provider && latest.model ?
                            `${latest.provider}, ${latest.model}` :
                            "Provider or model unknown"
                          }

                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm(`Delete "${s.title}" and all its sessions?`)) {
                            await api.deleteSet(s.id);
                            load();
                          }
                        }}
                        className="rounded-lg p-1.5 text-zinc-400 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                        aria-label="Delete set"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-5 flex gap-2">
                      {active ? (
                        <Button variant="primary" size="sm" onClick={() => navigate(`/study/${active.id}`)}>
                          <Play className="size-4" /> Continue
                        </Button>
                      ) : (
                        latest && (
                          <Button size="sm" onClick={() => navigate(`/study/${latest.id}/summary`)}>
                            Last summary
                          </Button>
                        )
                      )}
                      <Button variant={active ? "secondary" : "primary"} size="sm" disabled={!ready} onClick={() => newSession(s.id)}>
                        <RotateCcw className="size-4" /> New session
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!ready} onClick={() => newSession(s.id, "exam")} title={MODES.find((m) => m.id === "exam")?.hint}>
                        <PencilLine className="size-4" /> Exam practice
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
