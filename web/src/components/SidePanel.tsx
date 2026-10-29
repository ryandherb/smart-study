import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircleQuestion,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { api, type Message } from "../lib/api";
import { Markdown } from "./Markdown";
import { Button, ThinkingDots } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PanelTab = "source" | "ask";

function PdfViewer({
  files,
  target,
}: {
  files: { id: string; name: string }[];
  target: { file: string; page?: number } | null;
}) {
  const [fileId, setFileId] = useState(files[0]?.id);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [width, setWidth] = useState(400);
  const box = useRef<HTMLDivElement>(null);

  // Jump to the question's source when it changes.
  useEffect(() => {
    if (!target) return;
    const match =
      files.find((f) => f.name === target.file) ??
      files.find((f) => f.name.includes(target.file));
    if (match) setFileId(match.id);
    if (target.page) setPage(target.page);
  }, [target?.file, target?.page]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 32));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-study-line px-4 py-2">
        <select
          aria-label="Source document"
          value={fileId}
          onChange={(e) => {
            setFileId(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 truncate rounded-lg bg-transparent py-1 text-sm outline-none"
        >
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-xs tabular-nums text-study-muted">
          {page} / {pages || "–"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto p-4">
        {fileId && (
          <Document
            file={api.fileUrl(fileId)}
            onLoadSuccess={({ numPages }) => {
              setPages(numPages);
              setPage((p) => Math.min(p, numPages));
            }}
            loading={<ThinkingDots label="Loading PDF" />}
          >
            <Page
              pageNumber={page}
              width={width}
              className="overflow-hidden rounded-lg"
            />
          </Document>
        )}
      </div>
    </div>
  );
}

function AskTutor({
  messages,
  busy,
  onAsk,
}: {
  messages: Message[];
  busy: boolean;
  onAsk: (t: string) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const side = messages.filter((m) => m.kind === "side");
  useEffect(
    () => end.current?.scrollIntoView({ behavior: "smooth" }),
    [side.length, busy],
  );
  const send = () => {
    if (!text.trim() || busy) return;
    onAsk(text.trim());
    setText("");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {side.length === 0 && (
          <div className="mt-10 text-center text-sm text-study-muted">
            <MessageCircleQuestion className="mx-auto mb-2 size-8 text-study-muted" />
            Ask a side question about the material.
            <br />
            Your current question stays open.
          </div>
        )}
        {side.map((m, i) => (
          <div
            key={i}
            className={clsx(
              "max-w-[92%] rounded-lg px-4 py-2.5 text-sm",
              m.role === "user"
                ? "ml-auto bg-study-raised text-study-text"
                : "bg-study-surface",
            )}
          >
            {m.role === "user" ? (
              m.text
            ) : (
              <Markdown className="prose-sm">{m.text}</Markdown>
            )}
          </div>
        ))}
        {busy && side.at(-1)?.role === "user" && <ThinkingDots />}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-study-line p-3">
        <input
          aria-label="Ask the tutor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={
            busy
              ? "Tutor is busy…"
              : "e.g. why is log base irrelevant in Big-O?"
          }
          className="h-10 min-w-0 flex-1 rounded-md border border-study-line bg-study-surface px-3 text-sm outline-none focus:border-accent-500"
        />
        <Button
          aria-label="Send question"
          variant="primary"
          onClick={send}
          disabled={busy || !text.trim()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function SidePanel({
  tab,
  setTab,
  onClose,
  files,
  target,
  messages,
  busy,
  onAsk,
}: {
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  onClose: () => void;
  files: { id: string; name: string }[];
  target: { file: string; page?: number } | null;
  messages: Message[];
  busy: boolean;
  onAsk: (t: string) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Close panel"]')
      ?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, []);
  return (
    <aside
      ref={panelRef}
      aria-label="Source and tutor panel"
      className="card flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="flex items-center gap-1 border-b border-study-line p-2">
        {(["source", "ask"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === t
                ? "bg-study-raised text-study-text"
                : "text-study-muted hover:text-study-text",
            )}
          >
            {t === "source" ? "Source" : "Ask tutor"}
          </button>
        ))}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="size-4" />
        </Button>
      </div>
      {tab === "source" ? (
        <PdfViewer files={files} target={target} />
      ) : (
        <AskTutor messages={messages} busy={busy} onAsk={onAsk} />
      )}
    </aside>
  );
}
