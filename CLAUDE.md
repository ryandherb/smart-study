# Smart Study

Local study app: you upload PDFs (exams and slides), and Claude tutors you one question at a time. When you miss a question, it steps down to easier questions until you can solve the original. It runs on the user's Claude subscription through the Claude Agent SDK (`claude` CLI login, with no API key). It uses Bun workspaces: `server/` (Hono, `bun:sqlite`) and `web/` (Vite, React, Tailwind).

## Commands
- `bun run dev` starts the server on :3001 and the web app on :5173. Stop it with Ctrl+C. Don't wrap it in `timeout`, because that leaves orphaned child servers running.
- Typecheck: `cd server && bunx tsc --noEmit -p .` (and the same in `web/`). There's no test suite.

## How tutoring works (server/src/tutor/)
- `agent.ts` handles orchestration:
  1. **The plan** happens once per study set. Claude reads every PDF and calls `save_plan`, which fills `set_topics` with page refs. Later sessions copy this plan, so it isn't regenerated.
  2. **Then one SDK conversation runs per topic.** It gets only that topic's pages (`pages.ts` splits the PDFs with pdf-lib) and a short brief. `finish_topic` closes the conversation and starts the next unfinished topic.
  3. **The student can jump between topics at any time** (`jumpTo`). The topic they leave is saved on its `topics` row (conversation id, open question, scaffold stack) and restored on return. Returning to a topic with an open question makes no model call. Finished topics keep their outcome while being reviewed.
- `tools.ts`: the tutor acts **only** through the single `tutor_turn` tool (grade, then move: next/easier/back_to_original/retry/finish_topic, then the next question). A PostToolUse hook returns `continue: false`, so each answer costs exactly one model call.
- `prompt.ts`: the `Mode` prompts. To add a new study mode, add a `Mode` here (and to `MODES` in `web/src/lib/api.ts`). `adaptive` auto-scaffolds on misses. `exam` asks full free-response problems and uses the `retry` move (the same question stays open for a revised answer), scaffolding only on CONFUSED.
- **Hidden checks:** `tutor_turn`'s `question.check` stores a reference solution and rubric (`questions.reference_md`/`rubric`), and for code also a test `harness`. These never go into snapshots (only `hasTests`/`hasReference`). `POST /run` and `POST /reveal` use them without any model call. `/answer` runs the tests first and appends a `[tests: …]` line to the message.
- `runner.ts` runs harnesses locally (java/python/js/ts/c/cpp, whichever are installed; 5 s timeout). The harness is a full program with a `STUDENT_CODE_HERE` comment line that gets replaced by the answer, and it prints `PASS name` / `FAIL name: detail`. On insert the harness is run against `reference_code`. If that fails, the harness is dropped instead of making the model try again.
- State lives in SQLite (`data/`, gitignored), and the UI is driven by SSE events (`snapshot`, `graded`, `scaffold`, `usage`, …).

## Token usage (the main constraint)
The goal is a 3-hour session without exhausting the user's 5-hour limit. Current cost is about 15k tokens per answer. Don't regress it:
- Keep `strictMcpConfig: true` and `settings.disableClaudeAiConnectors: true` (in `BASE_OPTIONS`). Without them, the account's claude.ai connectors add about 140k tokens to *every* request.
- Don't attach whole PDFs to topic conversations, add more tutor tools, or rely on the model chaining several tool calls per turn. Each extra call re-sends the whole context.
- `result.modelUsage` / `total_cost_usd` are running totals **per conversation**. `usage.ts` turns them into increments and resets on every new conversation.
- The usage bar's 5-hour/weekly numbers come from `rate_limit_event` and are account-wide.

## Testing safely
- Never test against `data/`, because that's the user's real study data. Run an isolated instance instead:
  `PORT=3002 STUDY_DATA_DIR=<tmp dir> bun src/index.ts` (in `server/`) and `API_URL=http://localhost:3002 bunx vite --port 5174` (in `web/`).
- Every test turn spends the user's real quota. Use `claude-haiku-5-5` and keep runs short unless you're measuring something.
- For visual checks, use puppeteer-core with the system Firefox (`browser: "firefox"`, `/usr/bin/firefox`) in a scratch directory.

## Gotchas
- Model IDs use dashes: `claude-sonnet-5-5`, not `claude-sonnet-5.5` (that fails with `model_not_found`).
- Bun installs are isolated: transitive deps aren't importable, so `pdfjs-dist` is a direct dependency of `web/` (it must match react-pdf's version).
- Schema changes need an `addColumn` migration in `db/db.ts`, because users' existing databases don't re-run `CREATE TABLE`.
- Sessions with `flow = NULL` predate per-topic conversations. They continue without page refs and attach whole files, which is expensive. Suggest starting a new session.
