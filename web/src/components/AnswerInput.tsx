import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import clsx from "clsx";
import { Check, FlaskConical, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Question, TestResult } from "../lib/api";
import { Markdown } from "./Markdown";
import { TestResults } from "./TestResults";
import { Button, Kbd } from "./ui";

const LETTERS = "ABCDEFGH";

function langExtension(lang: string | null) {
  switch ((lang ?? "").toLowerCase()) {
    case "python":
    case "py":
      return [python()];
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      return [javascript({ typescript: true, jsx: true })];
    case "c":
    case "cpp":
    case "c++":
      return [cpp()];
    case "java":
      return [java()];
    case "sql":
      return [sql()];
    default:
      return [];
  }
}

const useDark = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
};

export function AnswerInput({
  question,
  disabled,
  initial,
  onSubmit,
  onRun,
}: {
  question: Question;
  disabled: boolean;
  /** Pre-fills the editor, e.g. with the previous attempt when revising. */
  initial?: string;
  onSubmit: (answer: string) => void;
  /** Runs the question's hidden tests locally (no model call). */
  onRun?: (code: string) => Promise<TestResult>;
}) {
  const [text, setText] = useState(initial ?? "");
  const [choice, setChoice] = useState<number | null>(null);
  const [results, setResults] = useState<TestResult | null>(null);
  const [running, setRunning] = useState(false);
  const dark = useDark();
  const textRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const extensions = useMemo(() => langExtension(question.language), [question.language]);

  useEffect(() => {
    setText(initial ?? "");
    setChoice(null);
    setResults(null);
    setTimeout(() => textRef.current?.focus(), 50);
  }, [question.id]);

  const answer =
    question.type === "mcq"
      ? choice === null
        ? ""
        : `${LETTERS[choice]}) ${question.choices![choice]}`
      : text.trim();
  const canSubmit = !disabled && answer.length > 0;
  const submit = () => canSubmit && onSubmit(answer);
  const canRun = !!onRun && question.hasTests && !running && text.trim().length > 0;
  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      setResults(await onRun!(text));
    } catch (e) {
      setResults({ status: "unsupported", passed: 0, total: 0, tests: [], output: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  // Keyboard: Ctrl/Cmd+Enter submits; A–H / 1–8 picks an MCQ choice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault();
        run();
        return;
      }
      if (question.type !== "mcq" || disabled || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, .cm-editor")) return;
      const n = question.choices?.length ?? 0;
      let idx = LETTERS.indexOf(e.key.toUpperCase());
      if (idx < 0 && /^[1-8]$/.test(e.key)) idx = Number(e.key) - 1;
      if (idx >= 0 && idx < n) setChoice(idx);
      if (e.key === "Enter" && choice !== null) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const footer = (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-400">
        <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to submit
        {question.hasTests && onRun && (
          <>
            {" "}· <Kbd>Ctrl</Kbd> + <Kbd>'</Kbd> to run tests
          </>
        )}
        {question.type === "mcq" && (
          <>
            {" "}· <Kbd>A</Kbd>–<Kbd>{LETTERS[(question.choices?.length ?? 1) - 1]}</Kbd> to choose
          </>
        )}
      </span>
      <span className="flex gap-2">
        {question.hasTests && onRun && (
          <Button onClick={run} disabled={!canRun} title="Check your draft against the hidden tests. Free: runs on your computer.">
            <FlaskConical className="size-4" /> {running ? "Running…" : "Run tests"}
          </Button>
        )}
        <Button variant="primary" onClick={submit} disabled={!canSubmit}>
          <Send className="size-4" /> Submit
        </Button>
      </span>
    </div>
  );

  if (question.type === "mcq") {
    return (
      <div>
        <div className="grid gap-2.5">
          {question.choices!.map((c, i) => {
            const selected = choice === i;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => setChoice(i)}
                onDoubleClick={() => !disabled && onSubmit(`${LETTERS[i]}) ${c}`)}
                className={clsx(
                  "group flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                  selected
                    ? "border-accent-500 bg-accent-500/10 ring-2 ring-accent-500/30"
                    : "border-zinc-200 hover:border-accent-300 hover:bg-zinc-50 dark:border-white/10 dark:hover:border-accent-400/50 dark:hover:bg-white/5",
                )}
              >
                <span
                  className={clsx(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                    selected
                      ? "bg-accent-600 text-white"
                      : "bg-zinc-100 text-zinc-500 group-hover:bg-accent-100 group-hover:text-accent-700 dark:bg-white/10 dark:text-zinc-300",
                  )}
                >
                  {selected ? <Check className="size-4" /> : LETTERS[i]}
                </span>
                <Markdown className="prose-sm flex-1 sm:prose-base">{c}</Markdown>
              </button>
            );
          })}
        </div>
        {footer}
      </div>
    );
  }

  if (question.type === "code") {
    return (
      <div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
          <CodeMirror
            value={text}
            onChange={setText}
            editable={!disabled}
            autoFocus
            minHeight="320px"
            maxHeight="70vh"
            theme={dark ? githubDark : githubLight}
            extensions={extensions}
            basicSetup={{ foldGutter: false }}
            placeholder={`Write your ${question.language ?? "code"} here…`}
          />
        </div>
        {results && <TestResults result={results} />}
        {footer}
      </div>
    );
  }

  if (question.type === "numeric") {
    return (
      <div>
        <input
          ref={textRef as React.RefObject<HTMLInputElement>}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Your answer (e.g. 3/11, 0.27, 2^n)"
          className="h-14 w-full rounded-xl border border-zinc-200 bg-white px-4 font-mono text-lg outline-none transition focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 dark:border-white/10 dark:bg-zinc-950/50"
        />
        {footer}
      </div>
    );
  }

  const hasMath = /\$[^$]+\$/.test(text);
  return (
    <div>
      <textarea
        ref={textRef as React.RefObject<HTMLTextAreaElement>}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Explain your answer. Use $...$ for math, e.g. $O(n \log n)$"
        className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base leading-relaxed outline-none transition focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 dark:border-white/10 dark:bg-zinc-950/50"
      />
      {hasMath && (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-200 px-4 py-3 dark:border-white/10">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Preview</div>
          <Markdown className="prose-sm">{text}</Markdown>
        </div>
      )}
      {footer}
    </div>
  );
}
