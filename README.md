# Study Claude

An adaptive study tutor that runs on your Claude subscription. Upload practice exams or slides (PDF) and Claude asks you one question at a time. If you get one wrong, it steps down to easier "stepping stone" problems until you can solve the original hard version. Then it moves on to the next topic.

## Run

```bash
bun install
bun run dev        # server on :3001, web UI on http://localhost:5173
```

Auth comes from your existing `claude` CLI login (the Claude Agent SDK), so you don't need an API key. Data lives in `./data/`, which you can override with `STUDY_DATA_DIR`.

## How it works

- `server/src/tutor/tools.ts`: Claude drives the UI only through tools (`extract_topics`, `next_topic`, `ask_question`, `grade_answer`, `start_scaffold`, `return_to_original`, `finish_session`). Each tool writes to SQLite and pushes an SSE event.
- `server/src/tutor/prompt.ts`: the tutoring method, as a `Mode`. To add a study mode (exam mode, flashcards, spaced review), add a `Mode` with its own prompt and tool subset.
- `server/src/tutor/agent.ts`: one long-lived `query()` per session with streaming input. It resumes the SDK session after a restart.
- `web/`: React, Tailwind, Motion, KaTeX, highlight.js, CodeMirror and react-pdf.

Keyboard shortcuts: `Ctrl+Enter` submits, `A`–`D` picks a choice, `N` continues.
