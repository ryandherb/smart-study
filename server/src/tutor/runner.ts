import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Marker line in a harness where the student's code is spliced in. */
export const MARKER = "STUDENT_CODE_HERE";

interface Runner {
  file: string;
  /** Optional compile step; a non-zero exit is reported as a compile error. */
  compile?: string[];
  run: string[];
}

const RUNNERS: Record<string, Runner> = {
  java: { file: "Main.java", run: ["java", "Main.java"] },
  python: { file: "main.py", run: ["python3", "main.py"] },
  javascript: { file: "main.js", run: [process.execPath, "main.js"] },
  typescript: { file: "main.ts", run: [process.execPath, "main.ts"] },
  c: { file: "main.c", compile: ["gcc", "-O1", "-o", "main", "main.c", "-lm"], run: ["./main"] },
  cpp: { file: "main.cpp", compile: ["g++", "-O1", "-std=c++20", "-o", "main", "main.cpp"], run: ["./main"] },
};

const ALIASES: Record<string, string> = { py: "python", js: "javascript", ts: "typescript", "c++": "cpp" };

const normalize = (lang: string | null | undefined) => {
  const l = (lang ?? "").toLowerCase().trim();
  return ALIASES[l] ?? l;
};

/** Languages whose toolchain is installed (checked once at startup). */
const AVAILABLE = new Set(
  Object.entries(RUNNERS)
    .filter(([, r]) => [r.compile?.[0], r.run[0]].every((cmd) => !cmd || cmd.startsWith("/") || cmd.startsWith("./") || Bun.which(cmd)))
    .map(([lang]) => lang),
);

export const runnableLanguages = () => [...AVAILABLE];
export const canRun = (lang: string | null | undefined) => AVAILABLE.has(normalize(lang));

export interface TestResult {
  status: "ok" | "compile_error" | "runtime_error" | "timeout" | "unsupported";
  passed: number;
  total: number;
  /** Parsed PASS/FAIL lines. */
  tests: { name: string; pass: boolean; detail?: string }[];
  /** Raw output (truncated), shown for compile/runtime errors. */
  output: string;
}

const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 8000;

/** Puts the student's code where the marker line is; Java imports move to the top of the file. */
function splice(lang: string, harness: string, code: string) {
  let header = "";
  if (lang === "java") {
    const lines = code.split("\n");
    const imports = lines.filter((l) => /^\s*import\s+[\w.*]+\s*;/.test(l));
    header = imports.join("\n");
    code = lines.filter((l) => !imports.includes(l)).join("\n");
  }
  const lines = harness.split("\n");
  const at = lines.findIndex((l) => l.includes(MARKER));
  if (at < 0) return null;
  lines.splice(at, 1, code);
  return (header ? header + "\n" : "") + lines.join("\n");
}

async function exec(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, TIMEOUT_MS);
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  clearTimeout(timer);
  return { code, timedOut, out: out.slice(0, MAX_OUTPUT), err: err.slice(0, MAX_OUTPUT) };
}

function parse(out: string) {
  const tests: TestResult["tests"] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^(PASS|FAIL)\s+([^:]*)(?::\s*(.*))?$/);
    if (m) tests.push({ name: m[2]!.trim(), pass: m[1] === "PASS", detail: m[3]?.trim() || undefined });
  }
  return tests;
}

/** Runs a Claude-written harness against the student's code locally. Costs no tokens. */
export async function runTests(language: string | null, harness: string, code: string): Promise<TestResult> {
  const lang = normalize(language);
  const runner = RUNNERS[lang];
  const empty = { passed: 0, total: 0, tests: [] };
  if (!runner || !AVAILABLE.has(lang)) return { status: "unsupported", ...empty, output: `No runner for '${language}'.` };
  const source = splice(lang, harness, code);
  if (!source) return { status: "unsupported", ...empty, output: "Test harness is missing its marker line." };

  const dir = await mkdtemp(join(tmpdir(), "study-run-"));
  try {
    await writeFile(join(dir, runner.file), source);
    if (runner.compile) {
      const c = await exec(runner.compile, dir);
      if (c.timedOut) return { status: "timeout", ...empty, output: "Compilation timed out." };
      if (c.code !== 0) return { status: "compile_error", ...empty, output: (c.err || c.out).trim() };
    }
    const r = await exec(runner.run, dir);
    const tests = parse(r.out);
    const passed = tests.filter((t) => t.pass).length;
    const base = { passed, total: tests.length, tests };
    if (r.timedOut) return { status: "timeout", ...base, output: `Timed out after ${TIMEOUT_MS / 1000}s (infinite loop?).\n${r.out}`.trim() };
    // Interpreted languages report syntax errors at run time, before any test line is printed.
    if (r.code !== 0 && !tests.length)
      return {
        status: /error: compilation failed|SyntaxError|IndentationError|error: Expected/.test(r.err) ? "compile_error" : "runtime_error",
        ...base,
        output: (r.err || r.out).trim(),
      };
    if (r.code !== 0) return { status: "runtime_error", ...base, output: (r.err || r.out).trim() };
    return { status: "ok", ...base, output: r.err.trim() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Compact line appended to the student's answer so the grader sees the test results. */
export function testSummary(r: TestResult) {
  const head = `${r.passed}/${r.total} passed${r.status === "ok" ? "" : `, ${r.status.replace("_", " ")}`}`;
  const fails = r.tests
    .filter((t) => !t.pass)
    .slice(0, 6)
    .map((t) => `FAIL ${t.name}${t.detail ? `: ${t.detail}` : ""}`);
  const errorLines = r.status === "ok" ? [] : r.output.split("\n").slice(0, 6);
  return [head, ...fails, ...errorLines].join("\n").slice(0, 700);
}
