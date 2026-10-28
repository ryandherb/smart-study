import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA } from "./schema";

export const DATA_DIR = process.env.STUDY_DATA_DIR ?? join(import.meta.dir, "../../../data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "study.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(SCHEMA);

// Migrations for databases created before a column existed.
const cols = (table: string) => db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const addColumn = (table: string, column: string, type: string) => {
  if (!cols(table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
};
addColumn("sessions", "usage", "TEXT");
addColumn("sessions", "flow", "TEXT"); // 'topic' = per-topic conversations; null = created by the original single-conversation flow
addColumn("topics", "notes", "TEXT");
addColumn("topics", "pages", "TEXT");
addColumn("topics", "outcome_note", "TEXT");

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
