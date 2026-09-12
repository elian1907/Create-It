import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  starterTemplates,
  type Template,
  type Task,
} from "../shared/schema.ts";
export const PROJECT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dataInput = path.resolve(
  process.env.MONTAGE_DATA || path.join(PROJECT, "data"),
);
mkdirSync(dataInput, { recursive: true, mode: 0o700 });
export const DATA = realpathSync(dataInput);
for (const dir of ["", "imports", "exports", "cache", "tmp"])
  mkdirSync(path.join(DATA, dir), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(DATA, "studio.sqlite"));
db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,appliedAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS templates(id TEXT NOT NULL,version INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(id,version));
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,recipeHash TEXT UNIQUE NOT NULL,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,inputHash TEXT NOT NULL,response TEXT NOT NULL);
INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
export function get<T>(kind: string, id: string): T | undefined {
  const row = db
    .prepare("SELECT json FROM entities WHERE kind=? AND id=?")
    .get(kind, id) as any;
  return row ? JSON.parse(row.json) : undefined;
}
export function all<T>(kind: string): T[] {
  return (
    db
      .prepare("SELECT json FROM entities WHERE kind=? ORDER BY rowid DESC")
      .all(kind) as any[]
  ).map((r) => JSON.parse(r.json));
}
export function put<T extends { id: string }>(kind: string, value: T) {
  db.prepare(
    "INSERT INTO entities(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json",
  ).run(kind, value.id, JSON.stringify(value));
}
export function setting<T>(id: string, fallback: T): T {
  return get<{ value: T }>("settings", id)?.value ?? fallback;
}
export function setSetting(id: string, value: unknown) {
  put("settings", { id, value } as any);
}
export function templates(): Template[] {
  return (
    db
      .prepare(
        "SELECT t.json FROM templates t JOIN (SELECT id,MAX(version) version FROM templates GROUP BY id) v ON t.id=v.id AND t.version=v.version ORDER BY t.rowid",
      )
      .all() as any[]
  ).map((r) => JSON.parse(r.json));
}
export function template(id: string, version?: number): Template | undefined {
  const row = (
    version
      ? db
          .prepare("SELECT json FROM templates WHERE id=? AND version=?")
          .get(id, version)
      : db
          .prepare(
            "SELECT json FROM templates WHERE id=? ORDER BY version DESC LIMIT 1",
          )
          .get(id)
  ) as any;
  return row ? JSON.parse(row.json) : undefined;
}
export function saveTemplate(t: Template) {
  const next = {
    ...t,
    version: (template(t.id)?.version ?? 0) + 1,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO templates VALUES(?,?,?)").run(
    next.id,
    next.version,
    JSON.stringify(next),
  );
  return next;
}
export function tasks(): Task[] {
  return (
    db.prepare("SELECT json FROM tasks ORDER BY rowid DESC").all() as any[]
  ).map((r) => JSON.parse(r.json));
}
export function task(id: string): Task | undefined {
  const r = db.prepare("SELECT json FROM tasks WHERE id=?").get(id) as any;
  return r ? JSON.parse(r.json) : undefined;
}
export function insertTask(t: Task) {
  db.prepare("INSERT INTO tasks VALUES(?,?,?)").run(
    t.id,
    t.recipeHash,
    JSON.stringify(t),
  );
}
export function updateTask(id: string, patch: Partial<Task>) {
  const t = task(id);
  if (!t) throw new Error("Tâche introuvable.");
  const next = { ...t, ...patch, updatedAt: new Date().toISOString() };
  db.prepare("UPDATE tasks SET json=? WHERE id=?").run(
    JSON.stringify(next),
    id,
  );
  return next;
}
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
if (templates().length === 0)
  for (const t of starterTemplates()) saveTemplate(t);
if (!get("settings", "exportRoots"))
  setSetting("exportRoots", [
    {
      id: "default",
      path: realpathSync(path.join(DATA, "exports")),
      name: "Exports Create It",
    },
  ]);
const tokenFile = path.join(DATA, "api-token");
if (!existsSync(tokenFile))
  writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
export const API_TOKEN = readFileSync(tokenFile, "utf8").trim();
