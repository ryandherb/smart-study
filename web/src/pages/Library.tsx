import { Recommendation } from "../components/Recommendation";
import clsx from "clsx";
import { FileText, GraduationCap, PencilLine, Play, Plus, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

function NewSet({ onCreated, onCancel, provider, ready, settings }: { onCreated: () => void; onCancel: () => void; provider: string; ready: boolean; settings: ReactNode }) {
  const [step, setStep] = useState<"kind" | "material" | "settings">("kind");
  const [kind, setKind] = useState<"general" | "homework">("general");
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<"pdf" | "text">("pdf");
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("adaptive");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const createdSetId = useRef<string | null>(null);
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
      if (kind === "homework") {
        const response = await fetch("/api/homework", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, provider, model: provider === "claude" ? model || undefined : undefined }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not create homework study set");
        onCreated();
        navigate(`/homework/${data.id}`);
        return;
      }
      if (!createdSetId.current) {
        const set = await api.createSet(source === "pdf" ? files : [], title, source === "text" ? sourceText.trim() : "");
        createdSetId.current = set.id;
      }
      const s = await api.startSession(createdSetId.current, provider === "claude" ? model || undefined : undefined, mode, provider);
      onCreated();
      navigate(`/study/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="card p-6" aria-label="Create a study set" aria-busy={busy}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium text-accent-600">{step === "kind" ? "Step 1 · Study type" : step === "material" ? "Step 2 · Study material" : kind === "homework" ? "Step 2 · Ready to start" : "Step 3 · Ready to start"}</p>
          <h2 className="text-xl font-semibold">{step === "kind" ? "What would you like to work on?" : step === "material" ? "What would you like to study?" : "Make it yours"}</h2>
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel} aria-label="Cancel creating study set"><X className="size-4" /></Button>
      </div>
      {step === "kind" && <div className="grid gap-3 sm:grid-cols-2">
        <button className="rounded-xl border border-zinc-200 p-5 text-left transition hover:border-accent-500 hover:bg-accent-500/5 dark:border-white/10" onClick={() => { setKind("general"); setStep("material"); }}>
          <GraduationCap className="mb-3 size-6 text-accent-500" /><span className="block font-semibold">General study</span>
          <span className="mt-1 block text-sm text-zinc-500">Practice topics, review class material, or prepare for an exam.</span>
        </button>
        <button className="rounded-xl border border-zinc-200 p-5 text-left transition hover:border-accent-500 hover:bg-accent-500/5 dark:border-white/10" onClick={() => { setKind("homework"); setStep("settings"); }}>
          <PencilLine className="mb-3 size-6 text-accent-500" /><span className="block font-semibold">Math homework</span>
          <span className="mt-1 block text-sm text-zinc-500">Work through problems with answer checks and step-by-step help.</span>
        </button>
      </div>}
      {step === "material" && <>
      <div className="mb-4 flex gap-2" role="group" aria-label="Study material source">
        <Button variant={source === "pdf" ? "primary" : "secondary"} onClick={() => setSource("pdf")} disabled={busy}><UploadCloud className="size-4" /> Upload PDFs</Button>
        <Button variant={source === "text" ? "primary" : "secondary"} onClick={() => setSource("text")} disabled={busy}><PencilLine className="size-4" /> Type topics</Button>
      </div>
      {source === "text" ? (
        <div>
          <label htmlFor="study-topics" className="mb-2 block text-sm font-medium">What would you like to study?</label>
          <textarea id="study-topics" value={sourceText} onChange={e => setSourceText(e.target.value)} maxLength={10000} rows={6}
            placeholder={"List topics, one per line:\nRecursion\nBinary search trees\nBig-O analysis\n\nOr describe a goal: Help me learn derivatives for first-year calculus."}
            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm outline-none focus:border-accent-500 dark:border-white/10 dark:bg-zinc-950/50" />
          <p className="mt-2 text-xs text-zinc-500">Enter a topic list or describe a subject. Include your level and learning goals to tailor the study set. No PDFs needed.</p>
        </div>
      ) : <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), add(e.dataTransfer.files))}
        role="button" tabIndex={0} aria-label="Upload PDF study material"
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
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
      </div>}

      <AnimatePresence>
        {(source === "pdf" && files.length > 0) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            {source === "pdf" && <ul className="mt-4 space-y-1.5">
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
            </ul>}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-6 flex justify-between gap-3">
        <Button onClick={() => setStep("kind")}>Back</Button>
        <Button variant="primary" disabled={source === "pdf" ? !files.length : !sourceText.trim()} onClick={() => setStep("settings")}>Continue</Button>
      </div>
      </>}
      {step === "settings" && <>
        <fieldset disabled={busy}>
        <p className="mb-4 text-sm text-zinc-500">{kind === "homework" ? "Your homework set will be ready for you to add your first math problem." : source === "pdf" ? `${files.length} PDF${files.length === 1 ? "" : "s"} selected for general study.` : "Your topics will be used to build a general study set."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                aria-label="Study set name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Set name, e.g. CS 201 Midterm"
                className="h-10 min-w-48 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-accent-500 dark:border-white/10 dark:bg-zinc-950/50"
              />
              {kind === "general" && <select
                aria-label="Study mode"
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
              </select>}
              {provider === "claude" && <select
                aria-label="AI model"
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
            </div>
            <details className="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-white/10" open={!ready}>
              <summary className="cursor-pointer text-sm font-medium">AI service settings</summary>
              <div className="mt-3">{settings}</div>
            </details>
            </fieldset>
            {err && <div role="alert" className="mt-3 text-sm text-rose-500">{err}</div>}
            <div className="mt-6 flex justify-between gap-3">
              <Button disabled={busy} onClick={() => { setErr(null); createdSetId.current = null; setStep(kind === "homework" ? "kind" : "material"); }}>Back</Button>
              <Button variant="primary" onClick={start} disabled={busy || !ready}>
                <Play className="size-4" /> {busy ? "Creating…" : "Create study set & start"}
              </Button>
            </div>
      </>}
    </section>
  );
}

export default function Library() {
  const [creating, setCreating] = useState(false);
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

        <section className="mb-10">
          {creating ? <NewSet onCreated={load} onCancel={() => setCreating(false)} provider={provider} ready={ready} settings={
        <div aria-label="AI service settings">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="provider" className="text-sm font-medium">AI service</label>
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
          {providerError && <p role="alert" className="mt-2 text-sm text-rose-500">{providerError}</p>}
        </div>
          } /> : <div className="card flex flex-wrap items-center justify-between gap-5 p-6">
            <div><h2 className="text-lg font-semibold">What are you learning today?</h2><p className="mt-1 text-sm text-zinc-500">Turn your materials, topics, or homework into a study set.</p></div>
            <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> Create a study set</Button>
          </div>}
        </section>
        {sessionError && <p role="alert" className="mb-4 text-sm text-rose-500">{sessionError}</p>}

        {sets && sets.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-500">Your study sets</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sets.map((s, i) => {
                const active = s.sessions.find((x) => x.status === "active");
                const latest = s.sessions[0];
                const isHomework = latest?.mode === "homework";
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
                        <p className="truncate text-xs text-zinc-500">{s.files.length ? s.files.join(", ") : s.sourceText || "Text topics"}</p>
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
                    {!isHomework && <Recommendation setId={s.id} provider={provider} ready={ready} />}
                    <div className="mt-5 flex gap-2">
                      {active ? (
                        <Button variant="primary" size="sm" onClick={() => navigate(active.mode === "homework" ? `/homework/${active.id}` : `/study/${active.id}`)}>
                          <Play className="size-4" /> Continue
                        </Button>
                      ) : (
                        latest && (
                          <Button size="sm" onClick={() => navigate(`/study/${latest.id}/summary`)}>
                            Last summary
                          </Button>
                        )
                      )}
                      {!isHomework && <><Button variant={active ? "secondary" : "primary"} size="sm" disabled={!ready} onClick={() => newSession(s.id)}>
                        <RotateCcw className="size-4" /> New session
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!ready} onClick={() => newSession(s.id, "exam")} title={MODES.find((m) => m.id === "exam")?.hint}>
                        <PencilLine className="size-4" /> Exam practice
                      </Button></>}
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
