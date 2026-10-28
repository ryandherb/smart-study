# Study Claude

An adaptive study tutor for Claude or ChatGPT subscriptions. Upload practice exams or slides (PDF) and study one question at a time. If you miss a question, the tutor offers easier stepping stone problems before returning to the original.

## Run

```bash
bun install
bun run dev        # server on :3001, web UI on http://localhost:5173
```

Connect either service on the machine running the server:

- **Claude:** install Claude Code and run `claude auth login`.
- **ChatGPT:** install the [OpenAI Codex CLI](https://developers.openai.com/codex/quickstart), run `codex login`, and sign in with a ChatGPT account that has Codex access. Install Poppler (`sudo apt install poppler-utils` on Ubuntu/Debian, `brew install poppler` on macOS) for PDF rendering. A recent Codex CLI with `exec --ignore-user-config` support is required.

In the library, **Quiz service** detects local logins. Choose Claude or ChatGPT; the browser remembers your choice for new sessions, including exam practice. Use **Refresh connections** after signing in. Existing sessions keep their original provider, and older sessions default to Claude. Detection checks local authentication and dependencies; actual model access and remaining quota are checked when generating a quiz. No API key is needed.

Data lives in `./data/`, overridable with `STUDY_DATA_DIR`. This is a local app: anyone who can access its server can use its logged-in services.

## How it works

- A topic plan is generated once per study set and shared by later sessions.
- Each topic gets its own conversation and only its relevant PDF pages. Switching topics preserves the open question and scaffold stack.
- Claude uses the Claude Agent SDK. ChatGPT uses isolated Codex CLI calls with PDF page images and persisted topic history. Both use the same validated tutor actions, grading, local code tests and reference solutions.
- The UI receives state changes through SSE. ChatGPT token usage is recorded; Codex CLI does not report the Claude-style subscription windows or API cost estimates.

Keyboard shortcuts: `Ctrl+Enter` submits, `A`–`D` picks a choice, `N` continues.

## Checks

```bash
bunx tsc --noEmit -p server
bunx tsc --noEmit -p web
bun test server/tests
```

Tests use temporary study data and a mock Codex executable; they do not spend subscription quota.
