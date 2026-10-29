import clsx from "clsx";
import { CheckCircle2, XCircle } from "lucide-react";
import type { TestResult } from "../lib/api";

const STATUS: Record<TestResult["status"], string> = {
  ok: "",
  compile_error: "Doesn't compile",
  runtime_error: "Crashed",
  timeout: "Timed out",
  unsupported: "Can't run",
};

export function TestChip({ result }: { result: TestResult }) {
  const all =
    result.status === "ok" &&
    result.total > 0 &&
    result.passed === result.total;
  return (
    <span
      className={clsx(
        "rounded-md px-2.5 py-0.5 text-xs font-medium tabular-nums",
        all
          ? "bg-success/15 text-success dark:text-success"
          : "bg-danger/15 text-danger dark:text-danger",
      )}
    >
      Tests {result.passed}/{result.total}
      {result.status !== "ok" && ` · ${STATUS[result.status]}`}
    </span>
  );
}

/** Local test run output: one row per test, plus compiler/runtime output when something broke. */
export function TestResults({ result }: { result: TestResult }) {
  return (
    <div
      role="status"
      className="mt-3 rounded-md border border-study-line bg-study-surface px-4 py-3 text-sm"
    >
      <div className="mb-2 flex items-center gap-2">
        <TestChip result={result} />
        <span className="text-xs text-study-muted">
          Ran locally, no tokens used
        </span>
      </div>
      {result.tests.length > 0 && (
        <ul className="space-y-1">
          {result.tests.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              {t.pass ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
              )}
              <span className="font-medium">{t.name}</span>
              {t.detail && (
                <span className="font-mono text-xs leading-5 text-study-muted">
                  {t.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {result.status !== "ok" && result.output && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-study-surface px-3 py-2 text-xs text-study-text">
          {result.output}
        </pre>
      )}
    </div>
  );
}
