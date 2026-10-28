import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA } from "./schema";

export const DATA_DIR = process.env.STUDY_DATA_DIR ?? join(import.meta.dir, "../../../data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "study.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(SCHEMA);

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
