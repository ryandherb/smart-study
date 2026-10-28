import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { db } from "../db/db";

export interface PageRef {
  fileId: string;
  page: number; // 1-based
}

interface FileRow {
  id: string;
  name: string;
  path: string;
}

const getFile = (fileId: string) =>
  db.query<FileRow, [string]>("SELECT id, name, path FROM files WHERE id = ?").get(fileId);

const docs = new Map<string, Promise<PDFDocument>>();
const loadDoc = (path: string) => {
  let d = docs.get(path);
  if (!d) docs.set(path, (d = Bun.file(path).arrayBuffer().then((b) => PDFDocument.load(b, { ignoreEncryption: true }))));
  return d;
};

export async function pageCount(fileId: string): Promise<number | null> {
  const f = getFile(fileId);
  if (!f) return null;
  try {
    return (await loadDoc(f.path)).getPageCount();
  } catch {
    return null; // unparseable PDF: callers fall back to attaching the whole file
  }
}

/** A single page as its own PDF, cached next to the original. Null if the page can't be extracted. */
async function pageBytes(ref: PageRef): Promise<Uint8Array | null> {
  const f = getFile(ref.fileId);
  if (!f) return null;
  const cached = join(dirname(f.path), "pages", `${f.id}-${ref.page}.pdf`);
  if (existsSync(cached)) return new Uint8Array(await Bun.file(cached).arrayBuffer());
  try {
    const src = await loadDoc(f.path);
    if (ref.page < 1 || ref.page > src.getPageCount()) return null;
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [ref.page - 1]);
    out.addPage(page!);
    const bytes = await out.save();
    mkdirSync(dirname(cached), { recursive: true });
    await Bun.write(cached, bytes);
    return bytes;
  } catch {
    return null;
  }
}

const docBlock = (data: Uint8Array, title: string) => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: Buffer.from(data).toString("base64") },
  title,
});

/** Document blocks for the given pages; whole files for anything that couldn't be split. */
export async function pageBlocks(refs: PageRef[]) {
  const blocks = [];
  const wholeFiles = new Set<string>();
  for (const ref of refs) {
    const f = getFile(ref.fileId);
    if (!f) continue;
    const bytes = await pageBytes(ref);
    if (bytes) blocks.push(docBlock(bytes, `${f.name} — page ${ref.page}`));
    else wholeFiles.add(f.id);
  }
  for (const id of wholeFiles) blocks.push(...(await fileBlocks([id])));
  return blocks;
}

export async function fileBlocks(fileIds: string[]) {
  const files = fileIds.map(getFile).filter((f): f is FileRow => !!f);
  return Promise.all(files.map(async (f) => docBlock(new Uint8Array(await Bun.file(f.path).arrayBuffer()), f.name)));
}
